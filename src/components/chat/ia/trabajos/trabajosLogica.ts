/**
 * Reglas puras de Trabajos de IA (Figma 91-chat-35). Los valores salen de los
 * CHECK de `ai_jobs` (verificados con el MCP el 2026-11-13).
 */
import type { AIJob } from '@/lib/services/aiJobsService';

export const TIPOS_TRABAJO = ['auto_response', 'respond', 'summarize', 'classify', 'translate', 'extract_intent', 'transcribe'] as const;
export const ESTADOS_TRABAJO = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'skipped', 'draft'] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

export type RangoTrabajos = 'hoy' | '7d' | '30d' | 'todo';

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

/** Días hacia atrás del filtro de fecha (0 = desde hoy); `null` = sin filtro. */
export function diasDeRango(r: RangoTrabajos): number | null {
  return r === 'hoy' ? 0 : r === '7d' ? 6 : r === '30d' ? 29 : null;
}

/** Créditos que cobró el trabajo, si el registro lo guarda; `null` si no se sabe. */
export function creditosCobrados(job: Pick<AIJob, 'metadata'>): number | null {
  const m = job.metadata ?? {};
  const v = m.credits_charged ?? m.creditos_cobrados ?? m.credits;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
