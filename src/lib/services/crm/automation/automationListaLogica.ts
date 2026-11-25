/**
 * Lógica pura de la lista de automatizaciones y su historial (Figma CRM
 * 1373:17 «Listado — listo» y 1373:1161 «Historial de ejecuciones»). Sin red ni
 * React: la usan las rutas de servidor (resumen de 7 días) y las pantallas
 * (filtros, columnas «Cuando» y «Acciones»).
 */

/** Chips del listado: Todas · Activas · Pausadas · Con error. */
export type FiltroReglas = 'todas' | 'activas' | 'pausadas' | 'conError';
export const FILTROS_REGLAS: readonly FiltroReglas[] = ['todas', 'activas', 'pausadas', 'conError'];

/** Chips del historial: Todas · Ejecutadas · Omitidas · Con error · Prueba en seco. */
export type ResultadoEjecucion = 'ejecutada' | 'omitida' | 'error' | 'seco' | 'enCurso';
export type FiltroHistorial = 'todas' | 'ejecutadas' | 'omitidas' | 'conError' | 'seco';
export const FILTROS_HISTORIAL: readonly FiltroHistorial[] = ['todas', 'ejecutadas', 'omitidas', 'conError', 'seco'];

/** Ventanas del selector de fechas del historial. */
export type RangoHistorial = '24h' | '7d' | '30d' | '90d';
export const RANGOS_HISTORIAL: readonly RangoHistorial[] = ['24h', '7d', '30d', '90d'];
const HORAS_RANGO: Record<RangoHistorial, number> = { '24h': 24, '7d': 168, '30d': 720, '90d': 2160 };

export function desdeRango(rango: RangoHistorial, ahora: Date): string {
  return new Date(ahora.getTime() - HORAS_RANGO[rango] * 3_600_000).toISOString();
}

export function esFiltroHistorial(v: unknown): v is FiltroHistorial {
  return typeof v === 'string' && (FILTROS_HISTORIAL as readonly string[]).includes(v);
}

export function esRangoHistorial(v: unknown): v is RangoHistorial {
  return typeof v === 'string' && (RANGOS_HISTORIAL as readonly string[]).includes(v);
}

export interface EjecucionMinima {
  status: string;
  dry_run?: boolean | null;
}

/** Cómo se cuenta una ejecución: la prueba en seco nunca cuenta como ejecutada. */
export function resultadoDeEjecucion(run: EjecucionMinima): ResultadoEjecucion {
  if (run.dry_run) return 'seco';
  if (run.status === 'failed') return 'error';
  if (run.status === 'skipped') return 'omitida';
  if (run.status === 'completed') return 'ejecutada';
  return 'enCurso';
}

/** Filtro del historial → columnas de `automation_runs` (lo usa la ruta de servidor). */
export function filtroHistorialAConsulta(filtro: FiltroHistorial): { dry_run?: boolean; statuses?: string[] } {
  switch (filtro) {
    case 'ejecutadas':
      return { dry_run: false, statuses: ['completed'] };
    case 'omitidas':
      return { dry_run: false, statuses: ['skipped'] };
    case 'conError':
      return { dry_run: false, statuses: ['failed'] };
    case 'seco':
      return { dry_run: true };
    default:
      return {};
  }
}

// ─── Resumen de 7 días (KPIs) ───────────────────────────────────────────────

export interface UltimoEstadoRegla {
  status: string;
  error_message: string | null;
  skip_reason: string | null;
  created_at: string;
}

export interface ResumenAutomatizaciones {
  /** Ejecuciones reales (no omitidas, no en seco) de los últimos 7 días. */
  ejecuciones: number;
  /** Las mismas, de los 7 días anteriores (para la variación). */
  ejecucionesPrevias: number;
  omitidas: number;
  errores: number;
  /** Última ejecución real de cada regla (para «Con error» y el subtítulo de la fila). */
  ultimoEstado: Record<string, UltimoEstadoRegla>;
}

export const RESUMEN_VACIO: ResumenAutomatizaciones = { ejecuciones: 0, ejecucionesPrevias: 0, omitidas: 0, errores: 0, ultimoEstado: {} };

/** Primera fila por regla de una lista ordenada de la más reciente a la más vieja. */
export function ultimoEstadoPorRegla(
  filas: ReadonlyArray<UltimoEstadoRegla & { automation_rule_id: string }>,
): Record<string, UltimoEstadoRegla> {
  const out: Record<string, UltimoEstadoRegla> = {};
  for (const f of filas) {
    if (out[f.automation_rule_id]) continue;
    out[f.automation_rule_id] = { status: f.status, error_message: f.error_message, skip_reason: f.skip_reason, created_at: f.created_at };
  }
  return out;
}

/** Variación porcentual redondeada; `null` si no hay base con qué comparar. */
export function variacionPorcentual(actual: number, previo: number): number | null {
  if (!previo) return null;
  return Math.round(((actual - previo) / previo) * 100);
}

export function reglaConError(id: string, ultimo: Record<string, UltimoEstadoRegla>): boolean {
  return ultimo[id]?.status === 'failed';
}

// ─── Filtros de la lista ────────────────────────────────────────────────────

export interface ReglaFiltrable {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filtrarReglas<T extends ReglaFiltrable>(
  reglas: readonly T[],
  busqueda: string,
  filtro: FiltroReglas,
  ultimo: Record<string, UltimoEstadoRegla>,
): T[] {
  const q = normalizar(busqueda);
  return reglas.filter((r) => {
    if (filtro === 'activas' && !r.is_active) return false;
    if (filtro === 'pausadas' && r.is_active) return false;
    if (filtro === 'conError' && !reglaConError(r.id, ultimo)) return false;
    if (!q) return true;
    return normalizar(`${r.name} ${r.description ?? ''}`).includes(q);
  });
}

export function contarActivas(reglas: readonly { is_active: boolean }[]): number {
  return reglas.filter((r) => r.is_active).length;
}

// ─── Columnas «Cuando» y «Acciones» ─────────────────────────────────────────

/**
 * Clave del disparador para la columna «Cuando»: el evento si la regla escucha
 * uno concreto, si no el tipo de disparador. Los puntos no valen en una clave
 * de next-intl: `opportunity.created` → `opportunity_created`.
 */
export function claveCuando(rule: { trigger_type: string; event?: string | null }): string {
  if (rule.trigger_type === 'event' && rule.event) return rule.event.replace(/\./g, '_');
  return rule.trigger_type;
}

export type IconoCuando = 'etapa' | 'crear' | 'llamada' | 'correo' | 'whatsapp' | 'tarea' | 'campo' | 'programada' | 'manual' | 'sla' | 'evento';

export function iconoCuando(rule: { trigger_type: string; event?: string | null }): IconoCuando {
  if (rule.trigger_type === 'stage_change') return 'etapa';
  if (rule.trigger_type === 'field_change') return 'campo';
  if (rule.trigger_type === 'schedule') return 'programada';
  if (rule.trigger_type === 'manual') return 'manual';
  const ev = rule.event ?? '';
  if (ev === 'opportunity.created') return 'crear';
  if (ev.startsWith('opportunity.')) return 'etapa';
  if (ev.startsWith('call.')) return 'llamada';
  if (ev.startsWith('email.')) return 'correo';
  if (ev.startsWith('whatsapp.')) return 'whatsapp';
  if (ev.startsWith('task.')) return 'tarea';
  if (ev.startsWith('sla.')) return 'sla';
  return 'evento';
}

/** Tipos de acción en orden, sin repetir (la columna dice «Crear tarea + correo»). */
export function tiposDeAcciones(actions: ReadonlyArray<{ type?: unknown }> | null | undefined): string[] {
  const out: string[] = [];
  for (const a of actions ?? []) {
    const t = typeof a?.type === 'string' ? a.type : '';
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Acciones que contactan al cliente: el interruptor pide confirmación y aplica la Ley 2300. */
export const ACCIONES_DE_ENVIO: readonly string[] = ['send_email', 'send_whatsapp', 'send_sms', 'start_ai_agent'];

export function tieneAccionesDeEnvio(actions: ReadonlyArray<{ type?: unknown }> | null | undefined): boolean {
  return (actions ?? []).some((a) => ACCIONES_DE_ENVIO.includes(String(a?.type)));
}

/** Clave i18n del aviso del constructor según qué envía la regla. */
export function avisoEnvio(actions: ReadonlyArray<{ type?: unknown }> | null | undefined): 'correos' | 'whatsapp' | 'mensajes' | null {
  const tipos = new Set((actions ?? []).map((a) => String(a?.type)));
  const correo = tipos.has('send_email');
  const otros = tipos.has('send_whatsapp') || tipos.has('send_sms') || tipos.has('start_ai_agent');
  if (correo && !otros) return 'correos';
  if (tipos.has('send_whatsapp') && !correo && !tipos.has('send_sms') && !tipos.has('start_ai_agent')) return 'whatsapp';
  if (correo || otros) return 'mensajes';
  return null;
}

/** Mueve un elemento de `desde` a `hasta` (arrastrar una acción). */
export function reordenar<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return [...lista];
  const out = [...lista];
  const [x] = out.splice(desde, 1);
  out.splice(hasta, 0, x);
  return out;
}
