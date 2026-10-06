/**
 * Lógica pura de la frecuencia de objeciones en llamadas (Figma CRM 1409:17 y
 * 1410:118018). Sin React. Los conteos vienen del servidor
 * (`/api/crm/objections/frequency`).
 */
import type { FrecuenciaObjeciones } from '@/lib/services/crm/objectionFrequencyService';

export type FilaFrecuencia = FrecuenciaObjeciones['frequencies'][number];

export interface ResumenFrecuencia {
  llamadas: number;
  /** Parte de todas las apariciones de objeciones (0–100, entero). */
  pct: number;
  /** Llamadas en las que, tras la objeción, la oportunidad avanzó (0–100). */
  superada: number | null;
}

export function resumenesPorObjecion(filas: readonly FilaFrecuencia[]): Map<string, ResumenFrecuencia> {
  const total = filas.reduce((s, f) => s + f.call_count, 0);
  return new Map(
    filas.map((f) => [
      f.objection_id,
      {
        llamadas: f.call_count,
        pct: total ? Math.round((100 * f.call_count) / total) : 0,
        superada: f.call_count ? Math.round((100 * f.advanced_count) / f.call_count) : null,
      },
    ]),
  );
}

/** Semana con más llamadas (la primera si empatan); null sin datos. */
export function semanaPico(semanas: readonly { week: string; call_count: number }[]): { week: string; call_count: number } | null {
  return semanas.reduce<{ week: string; call_count: number } | null>((max, s) => (s.call_count > (max?.call_count ?? 0) ? s : max), null);
}

/** Alto relativo de cada barra de la tendencia (0–100). */
export function altosTendencia(semanas: readonly { call_count: number }[]): number[] {
  const max = Math.max(0, ...semanas.map((s) => s.call_count));
  return semanas.map((s) => (max ? Math.max(4, Math.round((100 * s.call_count) / max)) : 0));
}

/** «02:10» desde milisegundos de la grabación. */
export function marcaTiempo(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
