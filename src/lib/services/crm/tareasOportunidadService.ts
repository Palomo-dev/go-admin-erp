/**
 * Tareas de UNA oportunidad para la pestaña «Tareas» del drawer y del detalle
 * (Figma CRM 822:235333 y 775:473990). Lectura por el servidor: organización
 * de la sesión, cliente con RLS y solo tareas del CRM (`related_to_type =
 * 'opportunity'`). La oportunidad se comprueba antes (404 si es de otra
 * organización, sin revelar si existe).
 *
 * Columnas verificadas por MCP el 2026-11-15: `tasks.completed_at` y
 * `completed_by` existen («Hecha el 18 sep. · Carlos Ruiz»). Las escrituras
 * siguen en su camino único (`crmTaskService` → `pmService`).
 */
import { CrmHttpError, type CrmSesion } from './crmRouteSupport';

export interface TareaOportunidad {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_to: string | null;
  responsable: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completada_por: string | null;
  created_at: string | null;
  customer_id: string | null;
  project_id: string | null;
  goal_id: string | null;
  type: string | null;
}

type Fila = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Nombre visible de un perfil: nombre y apellido, si no el correo. */
export function nombrePerfil(p: Fila | undefined): string | null {
  if (!p) return null;
  const nombre = [p.first_name, p.last_name].filter((x) => typeof x === 'string' && x.trim()).join(' ').trim();
  return nombre || texto(p.email);
}

/** Fila cruda + nombres → tarea de la pestaña (sin Supabase; se prueba aparte). */
export function aTareaOportunidad(r: Fila, nombres: Map<string, string | null>): TareaOportunidad {
  const asignada = texto(r.assigned_to);
  const completo = texto(r.completed_by);
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    description: texto(r.description),
    status: String(r.status ?? 'open'),
    priority: texto(r.priority),
    due_date: texto(r.due_date),
    assigned_to: asignada,
    responsable: asignada ? nombres.get(asignada) ?? null : null,
    completed_at: texto(r.completed_at),
    completed_by: completo,
    completada_por: completo ? nombres.get(completo) ?? null : null,
    created_at: texto(r.created_at),
    customer_id: texto(r.customer_id),
    project_id: texto(r.project_id),
    goal_id: texto(r.goal_id),
    type: texto(r.type),
  };
}

const COLUMNAS =
  'id, title, description, status, priority, due_date, assigned_to, completed_at, completed_by, created_at, customer_id, project_id, goal_id, type';

export async function listarTareasOportunidad(ctx: CrmSesion, oportunidadId: string): Promise<TareaOportunidad[]> {
  const db = ctx.supabase;
  const { data: opp, error: e1 } = await db.from('opportunities').select('id').eq('organization_id', ctx.organizationId).eq('id', oportunidadId).maybeSingle();
  if (e1) throw new Error(`tareas/oportunidad: ${e1.message}`);
  if (!opp) throw new CrmHttpError(404, 'no_encontrada', 'Oportunidad no encontrada');
  const { data, error } = await db
    .from('tasks')
    .select(COLUMNAS)
    .eq('organization_id', ctx.organizationId)
    .eq('related_to_type', 'opportunity')
    .eq('related_to_id', oportunidadId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`tareas: ${error.message}`);
  const filas = (data ?? []) as Fila[];
  const ids = new Set<string>();
  for (const r of filas) {
    if (typeof r.assigned_to === 'string') ids.add(r.assigned_to);
    if (typeof r.completed_by === 'string') ids.add(r.completed_by);
  }
  const nombres = new Map<string, string | null>();
  if (ids.size) {
    const { data: perfiles } = await db.from('profiles').select('id, first_name, last_name, email').in('id', [...ids]);
    for (const p of (perfiles ?? []) as Fila[]) nombres.set(String(p.id), nombrePerfil(p));
  }
  return filas.map((r) => aTareaOportunidad(r, nombres));
}
