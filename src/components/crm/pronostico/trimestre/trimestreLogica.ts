/**
 * Presentación del pronóstico trimestral por categorías (Figma CRM 1431:19,
 * 1434:648, 1434:1185, 1434:842149). Lógica pura, sin React. Los montos ya
 * vienen calculados por el servidor (`/api/crm/forecast`).
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import { moverTrimestre, pctDe } from '@/lib/services/crm/forecastLogica';

/** Trimestre anterior, actual y los dos siguientes (el del servidor manda). */
export function opcionesTrimestre(actual: string): string[] {
  return [-1, 0, 1, 2].map((d) => moverTrimestre(actual, d));
}

/** «2026-Q4» → { anio: 2026, q: 4 } (para «4.º trimestre 2026» en el i18n). */
export function partesTrimestre(periodo: string): { anio: number; q: number } {
  return { anio: Number(periodo.slice(0, 4)), q: Number(periodo.slice(-1)) };
}

export function nombreVendedor(u: { first_name: string | null; last_name: string | null } | undefined | null): string | null {
  const n = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return n || null;
}

/** Tono de la cobertura (compromiso ÷ cuota). */
export function tonoCobertura(c: number | null): TonoBadge {
  if (c === null) return 'neutro';
  if (c >= 1) return 'exito';
  if (c >= 0.7) return 'advertencia';
  return 'peligro';
}

/** Lo que falta para la cuota con lo comprometido (0 si ya la cubre) y el % del mejor caso. */
export function brechaCuota(cuota: number, compromiso: number, mejorCaso: number): { falta: number; pctMejor: number | null } {
  return { falta: Math.max(0, cuota - compromiso), pctMejor: pctDe(mejorCaso, cuota) };
}

/** Anchos (0–100) de la barra de cobertura: ganado ⊂ compromiso ⊂ mejor caso, sobre max(cuota, mejor caso). */
export function anchosCobertura(cuota: number, ganado: number, compromiso: number, mejorCaso: number): { ganado: number; compromiso: number; mejorCaso: number; cuota: number } {
  const escala = Math.max(cuota, mejorCaso, compromiso, ganado);
  const a = (n: number) => (escala > 0 ? Math.min(100, Math.max(0, (100 * n) / escala)) : 0);
  return { ganado: a(ganado), compromiso: a(compromiso), mejorCaso: a(mejorCaso), cuota: a(cuota) };
}

/** Valor inicial del campo de ajuste: el compromiso actual redondeado a la moneda. */
export function montoInicialAjuste(compromiso: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(compromiso * f) / f;
}

/** Diferencia del ajuste respecto al compromiso calculado («+$ 8.000.000»). */
export function deltaAjuste(nuevo: number | null, actual: number): number | null {
  return nuevo === null || !Number.isFinite(nuevo) ? null : nuevo - actual;
}
