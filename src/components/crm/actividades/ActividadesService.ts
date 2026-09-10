import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Activity,
  ActivityFilters,
  ActivityStats,
  CreateActivityInput,
  UpdateActivityInput,
} from './types';

/**
 * ActividadesService — lecturas de `/app/crm/actividades`.
 *
 * Reglas:
 *  - TODA consulta filtra por `organization_id` (la org viene de sesión).
 *  - Los errores se PROPAGAN: antes se devolvía `[]` y la pantalla mostraba
 *    «no hay actividades» cuando en realidad la carga había fallado.
 *  - La creación NO inserta desde el cliente: usa `POST /api/crm/activities`,
 *    que valida con zod, comprueba que la entidad relacionada es de la org,
 *    de-duplica por `call_id` y actualiza `opportunities.last_contact_at`.
 *  - La paginación es de servidor (`range` + `count: 'exact'`); antes se
 *    traían 100 filas y se cortaban en memoria, así que la última página
 *    mentía y nunca se veía la actividad 101.
 */

export interface ActivityPageParams {
  page: number;
  pageSize: number;
}

export interface ActivityPage {
  rows: Activity[];
  total: number;
}

export interface OrgUserOption {
  id: string;
  email: string;
  full_name?: string;
}

type ActivityRow = Omit<Activity, 'user' | 'customer' | 'opportunity'>;

/** Los métodos encadenables de PostgREST que usa el filtrado. */
interface ChainableFilters {
  eq(column: string, value: unknown): ChainableFilters;
  gte(column: string, value: unknown): ChainableFilters;
  lte(column: string, value: unknown): ChainableFilters;
  ilike(column: string, pattern: string): ChainableFilters;
}

/** `2026-09-09` → `2026-09-09T23:59:59.999Z` para que el «hasta» sea inclusivo. */
function endOfDay(value: string): string {
  if (value.includes('T')) return value;
  return `${value}T23:59:59.999`;
}

/** Escapa los comodines de PostgREST para que la búsqueda sea literal. */
function escapeLike(value: string): string {
  return value.replace(/[%_,()]/g, (m) => `\\${m}`);
}

class ActividadesService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Aplica los filtros comunes a cualquier query sobre `activities`
   * (la de la página y las de conteo comparten exactamente estas condiciones).
   */
  private applyFilters<T>(query: T, filters?: ActivityFilters): T {
    let q = query as unknown as ChainableFilters;
    if (filters?.activity_type) q = q.eq('activity_type', filters.activity_type);
    if (filters?.user_id) q = q.eq('user_id', filters.user_id);
    if (filters?.related_type) q = q.eq('related_type', filters.related_type);
    if (filters?.related_id) q = q.eq('related_id', filters.related_id);
    if (filters?.outcome) q = q.eq('outcome', filters.outcome);
    if (filters?.date_from) q = q.gte('occurred_at', filters.date_from);
    if (filters?.date_to) q = q.lte('occurred_at', endOfDay(filters.date_to));
    if (filters?.search?.trim()) q = q.ilike('notes', `%${escapeLike(filters.search.trim())}%`);
    return q as unknown as T;
  }

  /**
   * Página de actividades con las relaciones resueltas (quién, con quién).
   * Lanza si la consulta falla — la pantalla muestra error con reintento.
   */
  async listActivities(filters?: ActivityFilters, page?: ActivityPageParams): Promise<ActivityPage> {
    const orgId = this.getOrgId();
    const pageSize = Math.max(1, page?.pageSize ?? 10);
    const current = Math.max(1, page?.page ?? 1);
    const from = (current - 1) * pageSize;

    let query = supabase
      .from('activities')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .range(from, from + pageSize - 1);

    query = this.applyFilters(query, filters);

    const { data, error, count } = await query;
    if (error) {
      throw new Error(`No se pudieron cargar las actividades: ${error.message}`);
    }

    const rows = (data ?? []) as ActivityRow[];
    return { rows: await this.enrich(rows, orgId), total: count ?? rows.length };
  }

  /**
   * Resuelve cliente, oportunidad y autor de cada fila en 3 consultas (no N+1).
   * Si una de las tres falla no se pierde la lista: se registra y se sigue.
   */
  private async enrich(rows: ActivityRow[], orgId: number): Promise<Activity[]> {
    if (rows.length === 0) return [];

    const customerIds = Array.from(
      new Set(rows.filter((a) => a.related_type === 'customer' && a.related_id).map((a) => a.related_id as string))
    );
    const opportunityIds = Array.from(
      new Set(rows.filter((a) => a.related_type === 'opportunity' && a.related_id).map((a) => a.related_id as string))
    );
    const userIds = Array.from(new Set(rows.map((a) => a.user_id).filter((id): id is string => Boolean(id))));

    const [customersRes, opportunitiesRes, profilesRes] = await Promise.all([
      customerIds.length
        ? supabase
            .from('customers')
            .select('id, full_name, email, phone')
            .eq('organization_id', orgId)
            .in('id', customerIds)
        : Promise.resolve({ data: [], error: null } as const),
      opportunityIds.length
        ? supabase
            .from('opportunities')
            .select('id, name, amount, customer_id')
            .eq('organization_id', orgId)
            .in('id', opportunityIds)
        : Promise.resolve({ data: [], error: null } as const),
      userIds.length
        ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    if (customersRes.error) console.warn('[Actividades] clientes:', customersRes.error.message);
    if (opportunitiesRes.error) console.warn('[Actividades] oportunidades:', opportunitiesRes.error.message);
    if (profilesRes.error) console.warn('[Actividades] perfiles:', profilesRes.error.message);

    const customersMap = Object.fromEntries(
      ((customersRes.data ?? []) as Array<{ id: string; full_name: string; email?: string; phone?: string }>).map((c) => [c.id, c])
    );
    const opportunitiesMap = Object.fromEntries(
      ((opportunitiesRes.data ?? []) as Array<{ id: string; name: string | null; amount?: number; customer_id?: string | null }>).map((o) => [
        o.id,
        { id: o.id, title: o.name || 'Sin nombre', amount: o.amount, customer_id: o.customer_id ?? null },
      ])
    );
    const usersMap = Object.fromEntries(
      ((profilesRes.data ?? []) as Array<{ id: string; first_name?: string | null; last_name?: string | null; email?: string | null }>).map((p) => {
        const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        return [p.id, { id: p.id, email: p.email ?? '', full_name: fullName || p.email || 'Usuario' }];
      })
    );

    return rows.map((a) => ({
      ...a,
      user: a.user_id ? usersMap[a.user_id] : undefined,
      customer: a.related_type === 'customer' && a.related_id ? customersMap[a.related_id] : undefined,
      opportunity: a.related_type === 'opportunity' && a.related_id ? opportunitiesMap[a.related_id] : undefined,
    }));
  }

  async getActivityById(id: string): Promise<Activity | null> {
    const orgId = this.getOrgId();
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);
    if (!data) return null;

    const [enriched] = await this.enrich([data as ActivityRow], orgId);
    return enriched ?? (data as Activity);
  }

  /**
   * Crea vía `POST /api/crm/activities` (misma ruta que usan el timeline y las
   * acciones rápidas). El cliente nunca inserta directamente en `activities`.
   */
  async createActivity(input: CreateActivityInput): Promise<Activity> {
    const res = await fetch('/api/crm/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_type: input.activity_type,
        related_type: input.related_type,
        related_id: input.related_id,
        notes: input.notes ?? null,
        channel: input.channel ?? null,
        outcome: input.outcome ?? null,
        duration_seconds: input.duration_seconds ?? null,
        occurred_at: input.occurred_at,
        metadata: input.metadata ?? {},
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || `Error ${res.status} al crear la actividad`);
    }
    return json.data as Activity;
  }

  async updateActivity(id: string, input: UpdateActivityInput): Promise<Activity> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.activity_type !== undefined) updateData.activity_type = input.activity_type;
    if (input.notes !== undefined) updateData.notes = input.notes || null;
    if (input.related_type !== undefined) updateData.related_type = input.related_type || null;
    if (input.related_id !== undefined) updateData.related_id = input.related_id || null;
    if (input.occurred_at !== undefined) updateData.occurred_at = input.occurred_at;
    if (input.channel !== undefined) updateData.channel = input.channel;
    if (input.outcome !== undefined) updateData.outcome = input.outcome;
    if (input.duration_seconds !== undefined) updateData.duration_seconds = input.duration_seconds;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    const { data, error } = await supabase
      .from('activities')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.getOrgId())
      .select()
      .single();

    if (error) throw new Error(`No se pudo actualizar la actividad: ${error.message}`);
    return data as Activity;
  }

  async deleteActivity(id: string): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.getOrgId());
    if (error) throw new Error(`No se pudo eliminar la actividad: ${error.message}`);
  }

  async duplicateActivity(id: string): Promise<Activity> {
    const original = await this.getActivityById(id);
    if (!original) throw new Error('La actividad ya no existe');
    if (!original.related_type || !original.related_id) {
      throw new Error('La actividad no está ligada a un cliente ni a una oportunidad');
    }
    return this.createActivity({
      activity_type: original.activity_type,
      notes: original.notes || undefined,
      related_type: original.related_type,
      related_id: original.related_id,
      occurred_at: new Date().toISOString(),
      channel: original.channel,
      outcome: original.outcome,
      duration_seconds: original.duration_seconds,
      metadata: original.metadata,
    });
  }

  /**
   * Totales por tipo respetando los filtros activos (menos el propio tipo).
   * Se piden como `count` con `head: true`: no traen filas.
   */
  async getStats(filters?: ActivityFilters): Promise<ActivityStats> {
    const orgId = this.getOrgId();
    const base = { ...(filters ?? {}) };
    delete base.activity_type;

    const countFor = async (type?: string): Promise<number> => {
      let q = supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);
      q = this.applyFilters(q, base);
      if (type) q = q.eq('activity_type', type);
      const { count, error } = await q;
      if (error) throw new Error(`No se pudieron calcular los totales: ${error.message}`);
      return count ?? 0;
    };

    const [total, calls, emails, whatsapp, meetings, notes, tasks] = await Promise.all([
      countFor(),
      countFor('call'),
      countFor('email'),
      countFor('whatsapp'),
      countFor('meeting'),
      countFor('note'),
      countFor('task'),
    ]);

    return { total, calls, emails, whatsapp, meetings, notes, tasks };
  }

  async getCustomers(): Promise<{ id: string; full_name: string; email?: string; phone?: string }[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, email, phone')
      .eq('organization_id', this.getOrgId())
      .order('full_name')
      .limit(200);
    if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`);
    return data ?? [];
  }

  async getOpportunities(): Promise<{ id: string; title: string; customer_id?: string | null }[]> {
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, name, customer_id')
      .eq('organization_id', this.getOrgId())
      .order('name')
      .limit(200);
    if (error) throw new Error(`No se pudieron cargar las oportunidades: ${error.message}`);
    return (data ?? []).map((o: { id: string; name: string | null; customer_id?: string | null }) => ({
      id: o.id,
      title: o.name || 'Sin nombre',
      customer_id: o.customer_id ?? null,
    }));
  }

  /**
   * Miembros activos de la organización.
   *
   * `organization_members.user_id` tiene DOS claves foráneas (auth.users y
   * profiles), así que `profiles:user_id(...)` es ambiguo y PostgREST devuelve
   * vacío en silencio. Hay que nombrar la restricción.
   */
  async getUsers(): Promise<OrgUserOption[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, profiles!organization_members_user_id_fkey1(first_name, last_name, email)')
      .eq('organization_id', this.getOrgId())
      .eq('is_active', true);

    if (error) throw new Error(`No se pudo cargar el equipo: ${error.message}`);

    type Profile = { first_name?: string | null; last_name?: string | null; email?: string | null };
    return ((data ?? []) as Array<{ user_id: string; profiles: Profile | Profile[] | null }>).map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      const fullName = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
      return {
        id: m.user_id,
        email: p?.email ?? '',
        full_name: fullName || p?.email || 'Usuario',
      };
    });
  }
}

export const actividadesService = new ActividadesService();
