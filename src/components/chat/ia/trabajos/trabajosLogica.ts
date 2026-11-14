/**
 * Reglas puras de Trabajos de IA (Figma 91-chat-35). Los valores salen de los
 * CHECK de `ai_jobs` (verificados con el MCP el 2026-11-13).
 */
import type { AIJob } from '@/lib/services/aiJobsService';

export const TIPOS_TRABAJO = ['auto_response', 'respond', 'summarize', 'classify', 'translate', 'extract_intent', 'transcribe'] as const;
export const ESTADOS_TRABAJO = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'skipped', 'draft'] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

/** `personalizado`: Desde/Hasta libres (como el filtro de fechas del Chat anterior). */
export type RangoTrabajos = 'hoy' | '7d' | '30d' | 'todo' | 'personalizado';
export const RANGOS_TRABAJOS: readonly RangoTrabajos[] = ['hoy', '7d', '30d', 'todo', 'personalizado'];

/** `running` es el nombre viejo de `processing`. */
export function estadoTrabajo(status: string): EstadoTrabajo | string {
  return status === 'running' ? 'processing' : status;
}

export function tonoEstadoTrabajo(status: string): 'exito' | 'peligro' | 'informacion' | 'advertencia' | 'neutro' {
  switch (estadoTrabajo(status)) {
    case 'completed':
      return 'exito';
    case 'failed':
      return 'peligro';
    case 'processing':
      return 'informacion';
    case 'pending':
    case 'draft':
      return 'advertencia';
    default:
      return 'neutro';
  }
}

export function puedeReintentar(job: Pick<AIJob, 'status'>): boolean {
  return job.status === 'failed';
}

export function puedeCancelar(job: Pick<AIJob, 'status'>): boolean {
  const e = estadoTrabajo(job.status);
  return e === 'pending' || e === 'processing';
}

/** Días hacia atrás del filtro de fecha (0 = desde hoy); `null` = sin filtro (o Desde/Hasta libres). */
export function diasDeRango(r: RangoTrabajos): number | null {
  return r === 'hoy' ? 0 : r === '7d' ? 6 : r === '30d' ? 29 : null;
}

/**
 * Desde/Hasta libres en días calendario (`YYYY-MM-DD`): `hasta` se toma
 * completo (el filtro llega al inicio del día siguiente). Si vienen al revés,
 * se ordenan.
 */
export function limitesDias(desde: string | null | undefined, hasta: string | null | undefined): { desde: string | null; hastaExclusivo: string | null } {
  let a = desde || null;
  let b = hasta || null;
  if (a && b && a > b) [a, b] = [b, a];
  if (!b) return { desde: a, hastaExclusivo: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
  if (!m) return { desde: a, hastaExclusivo: null };
  const siguiente = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)).toISOString().slice(0, 10);
  return { desde: a, hastaExclusivo: siguiente };
}

/** Milisegundos entre inicio y fin del trabajo (en curso: hasta `ahora`); `null` sin inicio. */
export function duracionMs(job: Pick<AIJob, 'started_at' | 'completed_at'>, ahora: Date = new Date()): number | null {
  if (!job.started_at) return null;
  const ini = Date.parse(job.started_at);
  const fin = job.completed_at ? Date.parse(job.completed_at) : ahora.getTime();
  if (Number.isNaN(ini) || Number.isNaN(fin)) return null;
  return Math.max(0, fin - ini);
}

/** «850 ms», «2,4 s», «1,2 min» en el idioma de la interfaz. */
export function textoDuracion(ms: number | null, locale: string): string {
  if (ms == null) return '—';
  const n = (v: number, d: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(v);
  if (ms < 1000) return `${n(ms, 0)} ms`;
  if (ms < 60_000) return `${n(ms / 1000, 1)} s`;
  return `${n(ms / 60_000, 1)} min`;
}

/** Confianza 0–1 como porcentaje («85 %»); `—` sin dato. */
export function textoConfianza(score: number | null | undefined, locale: string): string {
  if (score == null || !Number.isFinite(Number(score))) return '—';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(Number(score));
}

/** Tono de la confianza (≥ 0,7 bien, ≥ 0,4 regular, menos: baja). */
export function tonoConfianza(score: number | null | undefined): 'exito' | 'advertencia' | 'peligro' | 'neutro' {
  if (score == null) return 'neutro';
  return score >= 0.7 ? 'exito' : score >= 0.4 ? 'advertencia' : 'peligro';
}

/** Primeros 8 caracteres del id, para la tabla. */
export function idCorto(id: string): string {
  return id.slice(0, 8);
}

/** Créditos que cobró el trabajo, si el registro lo guarda; `null` si no se sabe. */
export function creditosCobrados(job: Pick<AIJob, 'metadata'>): number | null {
  const m = job.metadata ?? {};
  const v = m.credits_charged ?? m.creditos_cobrados ?? m.credits;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
