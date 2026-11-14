import { supabase } from '@/lib/supabase/config';
import { correoVisible } from '@/lib/services/chat/fichaClienteChat';

// Tiempo máximo en minutos para considerar una sesión como "online"
const ONLINE_THRESHOLD_MINUTES = 3;

/**
 * Una visita al chat del sitio web: una fila de `widget_sessions` (la escribe
 * la Edge Function `chat-widget`), con su conversación si el visitante llegó a
 * escribir (`conversations.metadata.sessionId` = `anon_id`).
 */
export interface WidgetSession {
  id: string;
  organization_id: number;
  channel_id: string;
  customer_id: string | null;
  anon_id: string;
  user_agent: string | null;
  referrer: string | null;
  current_page: string | null;
  location_data: {
    country?: string;
    city?: string;
    region?: string;
  } | null;
  device_type: string | null;
  /** En línea: latido del widget en los últimos minutos (`last_seen_at`). */
  is_active: boolean;
  last_seen_at: string;
  expires_at: string;
  created_at: string;
  /** Conversación del visitante, si escribió. */
  conversation_id: string | null;
  /** Estado de esa conversación (`conversations.status`). */
  conversation_status?: string;
  /** Nombre corto de quien la atiende («Laura R.»), si está asignada. */
  assigned_name: string | null;
  channel?: {
    id: string;
    name: string;
    type: string;
  };
  customer?: {
    id: string;
    full_name: string;
    /** Correo para mostrar: el real del visitante, nunca el provisional `@widget.local`. */
    email: string | null;
    phone?: string | null;
    city?: string | null;
    last_seen_at?: string | null;
  };
}

export interface SessionStats {
  /** Visitas que empezaron hoy (zona de la organización). */
  today: number;
  /** En línea ahora (latido reciente). */
  active: number;
  /** De las de hoy, las que dejaron sus datos. */
  withCustomer: number;
  /** De las de hoy, las anónimas. */
  anonymous: number;
}

export interface SessionFilters {
  channelId?: string;
}

/** «Laura Restrepo» → «Laura R.». */
export function nombreCorto(nombre: string | null | undefined, apellido: string | null | undefined): string | null {
  const n = (nombre ?? '').trim();
  const a = (apellido ?? '').trim();
  if (!n && !a) return null;
  return a ? `${n} ${a.charAt(0).toUpperCase()}.`.trim() : n;
}

type Perfil = { first_name: string | null; last_name: string | null };
type Relacion<T> = T | T[] | null;
interface FilaSesion {
  id: string;
  organization_id: number;
  channel_id: string;
  customer_id: string | null;
  anon_id: string;
  user_agent: string | null;
  referrer: string | null;
  current_page: string | null;
  location_data: WidgetSession['location_data'];
  device_type: string | null;
  last_seen_at: string;
  expires_at: string;
  created_at: string;
  channel: Relacion<{ id: string; name: string; type: string }>;
  customer: Relacion<{ id: string; full_name: string; email: string | null; phone: string | null; city: string | null; metadata: Record<string, unknown> | null; last_seen_at: string | null }>;
}
interface ConversacionVisita {
  id: string;
  status: string;
  assigned_member_id: number | null;
  created_at: string;
  sesion: string;
}

class WidgetSessionsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext(): Promise<void> {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  private async logAudit(action: string, entityId: string | null, changes: Record<string, unknown>): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action,
        entity_type: 'widget_session',
        entity_id: entityId,
        changes,
        metadata: {},
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }

  private isOnline(lastSeenAt: string | null): boolean {
    if (!lastSeenAt) return false;
    const lastSeen = new Date(lastSeenAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    return diffMinutes <= ONLINE_THRESHOLD_MINUTES;
  }

  /**
   * Las últimas 200 visitas (por última actividad), en línea primero, con su
   * canal, su cliente y la conversación que abrieron (si escribieron).
   */
  async getSessions(filters?: SessionFilters): Promise<WidgetSession[]> {
    await this.setOrgContext();

    let consulta = supabase
      .from('widget_sessions')
      .select(
        `id, organization_id, channel_id, customer_id, anon_id, user_agent, referrer, current_page, location_data, device_type,
         last_seen_at, expires_at, created_at,
         channel:channels(id, name, type),
         customer:customers(id, full_name, email, phone, city, metadata, last_seen_at)`,
      )
      .eq('organization_id', this.organizationId)
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (filters?.channelId) consulta = consulta.eq('channel_id', filters.channelId);

    const { data, error } = await consulta;
    if (error) {
      console.error('Error obteniendo sesiones:', error);
      throw new Error('No se pudieron cargar las visitas del widget');
    }
    const filas = (data ?? []) as unknown as FilaSesion[];

    // Conversación de cada visita: la más reciente con `metadata.sessionId` = anon_id.
    const conversaciones = new Map<string, ConversacionVisita>();
    const anonIds = Array.from(new Set(filas.map((f) => f.anon_id).filter(Boolean)));
    for (let i = 0; i < anonIds.length; i += 100) {
      const { data: convs, error: errConv } = await supabase
        .from('conversations')
        .select('id, status, assigned_member_id, created_at, sesion:metadata->>sessionId')
        .eq('organization_id', this.organizationId)
        .in('metadata->>sessionId', anonIds.slice(i, i + 100));
      if (errConv) {
        console.error('Error obteniendo conversaciones de las visitas:', errConv);
        continue;
      }
      for (const c of (convs ?? []) as unknown as ConversacionVisita[]) {
        const previa = conversaciones.get(c.sesion);
        if (!previa || c.created_at > previa.created_at) conversaciones.set(c.sesion, c);
      }
    }

    // Nombre corto de quien atiende cada conversación asignada.
    const miembros = new Map<number, string>();
    const idsMiembro = Array.from(new Set(Array.from(conversaciones.values()).map((c) => c.assigned_member_id).filter((x): x is number => x != null)));
    if (idsMiembro.length > 0) {
      const { data: ms } = await supabase.from('organization_members').select('id, profiles(first_name, last_name)').eq('organization_id', this.organizationId).in('id', idsMiembro);
      for (const m of (ms ?? []) as unknown as { id: number; profiles: Perfil | Perfil[] | null }[]) {
        const perfil = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const nombre = nombreCorto(perfil?.first_name, perfil?.last_name);
        if (nombre) miembros.set(m.id, nombre);
      }
    }

    const sesiones: WidgetSession[] = filas.map((f) => {
      const conv = conversaciones.get(f.anon_id) ?? null;
      const cliente = Array.isArray(f.customer) ? f.customer[0] : f.customer;
      const canal = Array.isArray(f.channel) ? f.channel[0] : f.channel;
      return {
        id: f.id,
        organization_id: f.organization_id,
        channel_id: f.channel_id,
        customer_id: f.customer_id,
        anon_id: f.anon_id,
        user_agent: f.user_agent,
        referrer: f.referrer,
        current_page: f.current_page,
        location_data: f.location_data,
        device_type: f.device_type,
        is_active: this.isOnline(f.last_seen_at),
        last_seen_at: f.last_seen_at,
        expires_at: f.expires_at,
        created_at: f.created_at,
        conversation_id: conv?.id ?? null,
        conversation_status: conv?.status,
        assigned_name: conv?.assigned_member_id != null ? (miembros.get(conv.assigned_member_id) ?? null) : null,
        channel: canal ?? undefined,
        customer: cliente
          ? { id: cliente.id, full_name: cliente.full_name, email: correoVisible(cliente.email, cliente.metadata), phone: cliente.phone ?? null, city: cliente.city ?? null, last_seen_at: cliente.last_seen_at }
          : undefined,
      };
    });

    // En línea primero; después, por última actividad.
    return sesiones.sort((a, b) => (a.is_active !== b.is_active ? (a.is_active ? -1 : 1) : new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()));
  }

  async getSessionById(id: string): Promise<WidgetSession | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('widget_sessions')
      .select(`
        *,
        channel:channels(id, name, type),
        customer:customers(id, full_name, email)
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      console.error('Error obteniendo sesión:', error);
      return null;
    }

    return data;
  }

  /**
   * Cifras de la cabecera. `inicioHoy`: el inicio del día en la zona de la
   * organización, como instante con offset (`useFormatDate().toInstant`).
   */
  async getStats(inicioHoy: string): Promise<SessionStats> {
    await this.setOrgContext();
    const base = () => supabase.from('widget_sessions').select('id', { count: 'exact', head: true }).eq('organization_id', this.organizationId);
    const enLineaDesde = new Date(Date.now() - ONLINE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const [hoy, conCliente, enLinea] = await Promise.all([
      base().gte('created_at', inicioHoy),
      base().gte('created_at', inicioHoy).not('customer_id', 'is', null),
      base().gte('last_seen_at', enLineaDesde),
    ]);
    const error = hoy.error ?? conCliente.error ?? enLinea.error;
    if (error) throw error;
    const today = hoy.count ?? 0;
    const withCustomer = conCliente.count ?? 0;
    return { today, active: enLinea.count ?? 0, withCustomer, anonymous: Math.max(0, today - withCustomer) };
  }

  async blockSession(id: string, reason?: string): Promise<void> {
    await this.setOrgContext();

    // Cerrar la conversación en lugar de bloquear widget_session
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'closed' })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error bloqueando sesión:', error);
      throw new Error('No se pudo bloquear la sesión');
    }

    await this.logAudit('block_session', id, { reason });
  }

  async unblockSession(id: string): Promise<void> {
    await this.setOrgContext();

    // Reabrir la conversación
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'open' })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error desbloqueando sesión:', error);
      throw new Error('No se pudo desbloquear la sesión');
    }

    await this.logAudit('unblock_session', id, {});
  }

  async getChannels(): Promise<{ id: string; name: string; type: string }[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', this.organizationId)
      .eq('type', 'website')
      .order('name');

    if (error) {
      console.error('Error obteniendo canales:', error);
      return [];
    }

    return data || [];
  }
}

export default WidgetSessionsService;
