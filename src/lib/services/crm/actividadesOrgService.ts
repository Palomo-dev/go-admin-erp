/**
 * CRM ola 3A — línea de tiempo de la ORGANIZACIÓN para la pantalla Actividades
 * (plan §4.9, Figma 769:12376). La línea de tiempo por entidad
 * (`timelineService`) exige cliente u oportunidad; esta lee sin entidad fija.
 *
 * Fuentes (columnas verificadas por MCP el 2026-09-30):
 * - `activities` (canónica: llamada, correo, WhatsApp, reunión, nota heredada,
 *   tarea registrada, sistema, llamada IA);
 * - `notes` (D6: las notas nuevas viven aquí);
 * - `tasks` del CRM (`related_to_type` cliente u oportunidad; las del PM sin
 *   relación CRM no entran).
 *
 * Paginación por cursor estable `(instante, id)` con el valor CRUDO de la base
 * (microsegundos incluidos: pasar por `Date` los truncaría y el desempate
 * fallaría). Cada fuente trae `limite + 1` filas estrictamente por debajo del
 * cursor; se mezclan y se cortan en `limite`. El total exacto se cuenta solo en
 * la primera página (la pantalla lo conserva).
 *
 * `editable` lo decide el servidor con la misma regla que `activityEditService`
 * (D5): lo propio, o todo con `crm.activities.edit_any`; nunca las `system`.
 * Las tareas se editan en su propio módulo: aquí no son editables.
 */

import { esActividadAdministrada } from './actividadAdministrada';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CRM_PERMISOS, CrmHttpError, tienePermisoCrm, UUID_RE, type CrmSesion } from './crmRouteSupport';

export const TIPOS_ACTIVIDAD_FEED = ['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'note', 'system', 'ai_call', 'task'] as const;
export type TipoActividadFeed = (typeof TIPOS_ACTIVIDAD_FEED)[number];

export interface FiltrosFeed {
  tipos: TipoActividadFeed[] | null;
  q: string;
  usuarioId: string | null;
  clienteId: string | null;
  oportunidadId: string | null;
  /** Instantes ISO; `hasta` es exclusivo. */
  desde: string | null;
  hasta: string | null;
}

export interface EntradaFeed {
  id: string;
  fuente: 'activity' | 'note' | 'task';
  /** `activity_type`, o 'note' / 'task' para las otras dos tablas. */
  tipo: string;
  ocurrio_en: string | null;
  autor_id: string | null;
  autor: string | null;
  texto: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  channel: string | null;
  direccion: string | null;
  fijada: boolean;
  tarea: { estado: string | null; prioridad: string | null; vence: string | null } | null;
  cliente: { id: string; nombre: string | null } | null;
  oportunidad: { id: string; nombre: string | null } | null;
  editable: boolean;
}

export interface PaginaFeed {
  entradas: EntradaFeed[];
  cursor: string | null;
  /** Solo en la primera página. */
  total: number | null;
}

// ─── Lectura de parámetros ──────────────────────────────────────────────────

const esIso = (v: string | null): v is string => !!v && !Number.isNaN(Date.parse(v));

export function leerFiltrosFeed(sp: URLSearchParams): FiltrosFeed {
  const tipos = (sp.get('types') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is TipoActividadFeed => (TIPOS_ACTIVIDAD_FEED as readonly string[]).includes(t));
  const uuid = (k: string) => {
    const v = sp.get(k);
    if (v && !UUID_RE.test(v)) throw new CrmHttpError(400, 'parametro_invalido', `${k} inválido`);
    return v || null;
  };
  const desde = sp.get('from');
  const hasta = sp.get('to');
  if ((desde && !esIso(desde)) || (hasta && !esIso(hasta))) throw new CrmHttpError(400, 'parametro_invalido', 'Rango de fechas inválido');
  return {
    tipos: tipos.length ? tipos : null,
    q: (sp.get('q') ?? '').trim().slice(0, 100),
    usuarioId: uuid('user_id'),
    clienteId: uuid('customer_id'),
    oportunidadId: uuid('opportunity_id'),
    desde: desde || null,
    hasta: hasta || null,
  };
}

/** Cursor opaco: base64url de «instante|id». */
export function codificarCursor(instante: string, id: string): string {
  return Buffer.from(`${instante}|${id}`, 'utf8').toString('base64url');
}

export function decodificarCursor(cursor: string | null): { at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!esIso(at) || !UUID_RE.test(id ?? '')) throw new Error('forma');
    return { at, id };
  } catch {
    throw new CrmHttpError(400, 'cursor_invalido', 'Cursor inválido');
  }
}

// ─── Fuentes ────────────────────────────────────────────────────────────────

type Fuente = 'activity' | 'note' | 'task';
type Fila = Record<string, unknown>;
// PostgREST encadena filtros sobre un builder genérico; se tipa lo que se usa.
type Consulta = {
  eq: (c: string, v: unknown) => Consulta;
  in: (c: string, v: unknown[]) => Consulta;
  ilike: (c: string, v: string) => Consulta;
  gte: (c: string, v: string) => Consulta;
  lt: (c: string, v: string) => Consulta;
  or: (expr: string) => Consulta;
  order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => Consulta;
  limit: (n: number) => Consulta;
} & PromiseLike<{ data: Fila[] | null; error: { message: string } | null; count?: number | null }>;

const COLUMNAS: Record<Fuente, { tabla: string; instante: string; select: string; usuario: string }> = {
  activity: {
    tabla: 'activities',
    instante: 'occurred_at',
    select: 'id, activity_type, call_id, notes, user_id, occurred_at, related_type, related_id, channel, outcome, duration_seconds, metadata',
    usuario: 'user_id',
  },
  note: { tabla: 'notes', instante: 'created_at', select: 'id, body, user_id, created_at, related_type, related_id, is_pinned', usuario: 'user_id' },
  task: {
    tabla: 'tasks',
    instante: 'created_at',
    select: 'id, title, description, assigned_to, created_by, created_at, status, priority, due_date, related_to_type, related_to_id, customer_id',
    usuario: 'assigned_to',
  },
};

const escaparLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Qué fuentes aplican y con qué `activity_type`. */
export function fuentesDeTipos(tipos: readonly TipoActividadFeed[] | null): { activity: TipoActividadFeed[] | null | false; note: boolean; task: boolean } {
  if (!tipos) return { activity: null, note: true, task: true };
  return { activity: tipos.length ? [...tipos] : false, note: tipos.includes('note'), task: tipos.includes('task') };
}

function aplicarFiltros(q: Consulta, fuente: Fuente, f: FiltrosFeed, extra: { tiposActividad: TipoActividadFeed[] | null; oportunidadesCliente: string[] }): Consulta {
  const col = COLUMNAS[fuente];
  if (fuente === 'activity' && extra.tiposActividad) q = q.in('activity_type', extra.tiposActividad);
  if (fuente === 'task') q = q.in('related_to_type', ['customer', 'opportunity']);
  if (f.usuarioId) q = q.eq(col.usuario, f.usuarioId);
  if (f.q) q = q.ilike(fuente === 'activity' ? 'notes' : fuente === 'note' ? 'body' : 'title', `%${escaparLike(f.q)}%`);
  const tipoRel = fuente === 'task' ? 'related_to_type' : 'related_type';
  const idRel = fuente === 'task' ? 'related_to_id' : 'related_id';
  if (f.oportunidadId) q = q.eq(tipoRel, 'opportunity').eq(idRel, f.oportunidadId);
  else if (f.clienteId) {
    // uuid validados en `leerFiltrosFeed` / leídos de la base: nada del usuario se interpola.
    const propias = [`and(${tipoRel}.eq.customer,${idRel}.eq.${f.clienteId})`];
    if (extra.oportunidadesCliente.length) propias.push(`and(${tipoRel}.eq.opportunity,${idRel}.in.(${extra.oportunidadesCliente.join(',')}))`);
    q = q.or(propias.join(','));
  }
  if (f.desde) q = q.gte(col.instante, f.desde);
  if (f.hasta) q = q.lt(col.instante, f.hasta);
  return q;
}

async function leerFuente(
  db: SupabaseClient,
  org: number,
  fuente: Fuente,
  f: FiltrosFeed,
  extra: { tiposActividad: TipoActividadFeed[] | null; oportunidadesCliente: string[] },
  cursor: { at: string; id: string } | null,
  limite: number,
): Promise<Fila[]> {
  const col = COLUMNAS[fuente];
  let q = (db.from(col.tabla).select(col.select) as unknown as Consulta).eq('organization_id', org);
  q = aplicarFiltros(q, fuente, f, extra);
  if (cursor) q = q.or(`${col.instante}.lt."${cursor.at}",and(${col.instante}.eq."${cursor.at}",id.lt.${cursor.id})`);
  const { data, error } = await q.order(col.instante, { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(limite + 1);
  if (error) throw new Error(`actividades/${col.tabla}: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, __fuente: fuente, __at: r[col.instante] ?? null }));
}

async function contarFuente(db: SupabaseClient, org: number, fuente: Fuente, f: FiltrosFeed, extra: { tiposActividad: TipoActividadFeed[] | null; oportunidadesCliente: string[] }): Promise<number> {
  const col = COLUMNAS[fuente];
  let q = (db.from(col.tabla).select('id', { count: 'exact', head: true }) as unknown as Consulta).eq('organization_id', org);
  q = aplicarFiltros(q, fuente, f, extra);
  const { count, error } = await q;
  if (error) throw new Error(`actividades/${col.tabla} (conteo): ${error.message}`);
  return count ?? 0;
}

async function oportunidadesDelCliente(db: SupabaseClient, org: number, clienteId: string | null): Promise<string[]> {
  if (!clienteId) return [];
  const { data, error } = await db.from('opportunities').select('id').eq('organization_id', org).eq('customer_id', clienteId).limit(500);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((o) => o.id);
}

/** Orden descendente por (instante, id), nulos al final. */
export function compararDesc(a: Fila, b: Fila): number {
  const x = String(a.__at ?? '');
  const y = String(b.__at ?? '');
  if (x !== y) return x < y ? 1 : -1;
  return String(a.id) < String(b.id) ? 1 : String(a.id) > String(b.id) ? -1 : 0;
}

/** Mezcla las filas de las fuentes y corta la página. */
export function mezclarPagina(filas: Fila[], limite: number): { pagina: Fila[]; hayMas: boolean } {
  const orden = [...filas].sort(compararDesc);
  return { pagina: orden.slice(0, limite), hayMas: orden.length > limite };
}

// ─── Hidratación ────────────────────────────────────────────────────────────

async function nombres(db: SupabaseClient, org: number, filas: Fila[]) {
  const usuarios = new Set<string>();
  const clientes = new Set<string>();
  const oportunidades = new Set<string>();
  for (const r of filas) {
    const u = r.__fuente === 'task' ? r.assigned_to : r.user_id;
    if (typeof u === 'string') usuarios.add(u);
    const tipo = r.__fuente === 'task' ? r.related_to_type : r.related_type;
    const id = r.__fuente === 'task' ? r.related_to_id : r.related_id;
    if (typeof id === 'string') (tipo === 'opportunity' ? oportunidades : clientes).add(id);
    if (r.__fuente === 'task' && typeof r.customer_id === 'string') clientes.add(r.customer_id);
  }
  const opps = oportunidades.size
    ? ((await db.from('opportunities').select('id, name, customer_id').eq('organization_id', org).in('id', [...oportunidades])).data ?? [])
    : [];
  for (const o of opps as Fila[]) if (typeof o.customer_id === 'string') clientes.add(o.customer_id);
  const [clis, perfiles] = await Promise.all([
    clientes.size ? db.from('customers').select('id, full_name').eq('organization_id', org).in('id', [...clientes]) : Promise.resolve({ data: [] }),
    usuarios.size ? db.from('profiles').select('id, first_name, last_name, email').in('id', [...usuarios]) : Promise.resolve({ data: [] }),
  ]);
  const mapa = <T,>(xs: Fila[] | null | undefined, f: (x: Fila) => T) => new Map((xs ?? []).map((x) => [String(x.id), f(x)]));
  return {
    oportunidades: mapa(opps as Fila[], (o) => ({ nombre: (o.name as string | null) ?? null, clienteId: (o.customer_id as string | null) ?? null })),
    clientes: mapa(clis.data as Fila[], (c) => (c.full_name as string | null) ?? null),
    usuarios: mapa(perfiles.data as Fila[], (p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || (p.email as string | null) || null),
  };
}

type Nombres = Awaited<ReturnType<typeof nombres>>;

/** Fila cruda → entrada de la pantalla (sin React; se prueba aparte). */
export function aEntrada(r: Fila, n: Nombres, sesion: { usuarioId: string; editarCualquiera: boolean }): EntradaFeed {
  const fuente = r.__fuente as Fuente;
  const autorId = (fuente === 'task' ? r.assigned_to : r.user_id) as string | null;
  const tipoRel = (fuente === 'task' ? r.related_to_type : r.related_type) as string | null;
  const idRel = (fuente === 'task' ? r.related_to_id : r.related_id) as string | null;
  const opp = tipoRel === 'opportunity' && idRel ? n.oportunidades.get(idRel) : undefined;
  const clienteId = tipoRel === 'customer' ? idRel : opp?.clienteId ?? ((fuente === 'task' ? r.customer_id : null) as string | null);
  const tipo = fuente === 'activity' ? String(r.activity_type) : fuente;
  const propia = !!autorId && autorId === sesion.usuarioId;
  const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    fuente,
    tipo,
    ocurrio_en: (r.__at as string | null) ?? null,
    autor_id: autorId,
    autor: autorId ? n.usuarios.get(autorId) ?? null : null,
    texto: ((fuente === 'activity' ? r.notes : fuente === 'note' ? r.body : r.title) as string | null) ?? null,
    outcome: (r.outcome as string | null) ?? null,
    duration_seconds: typeof r.duration_seconds === 'number' ? r.duration_seconds : null,
    channel: (r.channel as string | null) ?? null,
    direccion: typeof meta.direction === 'string' ? meta.direction : null,
    fijada: r.is_pinned === true,
    tarea: fuente === 'task' ? { estado: (r.status as string) ?? null, prioridad: (r.priority as string) ?? null, vence: (r.due_date as string) ?? null } : null,
    cliente: clienteId ? { id: clienteId, nombre: n.clientes.get(clienteId) ?? null } : null,
    oportunidad: opp && idRel ? { id: idRel, nombre: opp.nombre } : null,
    editable: fuente !== 'task' && tipo !== 'system' && !esActividadAdministrada(r) && (propia || sesion.editarCualquiera),
  };
}

// ─── API del servicio ───────────────────────────────────────────────────────

export async function listarActividadesOrg(ctx: CrmSesion, f: FiltrosFeed, opciones: { cursor: string | null; limite: number }): Promise<PaginaFeed> {
  const limite = Math.min(Math.max(opciones.limite || 20, 1), 50);
  const cursor = decodificarCursor(opciones.cursor);
  const fuentes = fuentesDeTipos(f.tipos);
  const extra = { tiposActividad: fuentes.activity || null, oportunidadesCliente: await oportunidadesDelCliente(ctx.supabase, ctx.organizationId, f.clienteId) };
  const activas: Fuente[] = [...(fuentes.activity !== false ? (['activity'] as const) : []), ...(fuentes.note ? (['note'] as const) : []), ...(fuentes.task ? (['task'] as const) : [])];

  const [lotes, conteos, editarCualquiera] = await Promise.all([
    Promise.all(activas.map((s) => leerFuente(ctx.supabase, ctx.organizationId, s, f, extra, cursor, limite))),
    cursor ? Promise.resolve(null) : Promise.all(activas.map((s) => contarFuente(ctx.supabase, ctx.organizationId, s, f, extra))),
    tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera),
  ]);
  const { pagina, hayMas } = mezclarPagina(lotes.flat(), limite);
  const n = await nombres(ctx.supabase, ctx.organizationId, pagina);
  const entradas = pagina.map((r) => aEntrada(r, n, { usuarioId: ctx.userId, editarCualquiera }));
  const ultima = pagina[pagina.length - 1];
  return {
    entradas,
    cursor: hayMas && ultima?.__at ? codificarCursor(String(ultima.__at), String(ultima.id)) : null,
    total: conteos ? conteos.reduce((s, x) => s + x, 0) : null,
  };
}

export interface KpisActividades {
  total: number;
  llamadas: number;
  correos: number;
  whatsapp: number;
  reuniones: number;
  notas: number;
  tareasAbiertas: number;
}

/** Los 7 KPI de la franja (Figma 769:12376) con el rango, responsable y entidad de la pantalla. */
export async function kpisActividadesOrg(ctx: CrmSesion, f: FiltrosFeed): Promise<KpisActividades> {
  const org = ctx.organizationId;
  const base = { ...f, tipos: null };
  const extra = (tipos: TipoActividadFeed[] | null) => ({ tiposActividad: tipos, oportunidadesCliente: [] as string[] });
  const oppsCliente = await oportunidadesDelCliente(ctx.supabase, org, f.clienteId);
  const conOpps = (tipos: TipoActividadFeed[] | null) => ({ ...extra(tipos), oportunidadesCliente: oppsCliente });
  const contar = (fuente: Fuente, tipos: TipoActividadFeed[] | null) => contarFuente(ctx.supabase, org, fuente, base, conOpps(tipos));

  const tareasAbiertas = async () => {
    let q = (ctx.supabase.from('tasks').select('id', { count: 'exact', head: true }) as unknown as Consulta).eq('organization_id', org);
    q = aplicarFiltros(q, 'task', { ...base, desde: null, hasta: null, q: '' }, conOpps(null)).in('status', ['open', 'in_progress']);
    const { count, error } = await q;
    if (error) throw new Error(`actividades/tasks (abiertas): ${error.message}`);
    return count ?? 0;
  };

  const [actividades, notasTabla, llamadas, correos, whatsapp, reuniones, notasActividad, abiertas] = await Promise.all([
    contar('activity', null),
    contar('note', null),
    contar('activity', ['call', 'sms']),
    contar('activity', ['email']),
    contar('activity', ['whatsapp']),
    contar('activity', ['meeting', 'visit']),
    contar('activity', ['note']),
    tareasAbiertas(),
  ]);
  return { total: actividades + notasTabla, llamadas, correos, whatsapp, reuniones, notas: notasActividad + notasTabla, tareasAbiertas: abiertas };
}
