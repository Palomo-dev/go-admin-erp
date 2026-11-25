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
  return c === null ? 'neutro' : tonoProgresoCobertura(c);
}

/** El mismo tono para la barra de progreso del móvil (siempre con cobertura). */
export function tonoProgresoCobertura(c: number): 'exito' | 'advertencia' | 'peligro' {
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

/** Qué ocupa el cuerpo de la pantalla (Figma 1431:19, 1434:648, 1434:842149). */
export type CuerpoPronostico = 'sinCuotas' | 'sinOportunidades' | 'vendedores' | 'meses' | 'oportunidades';

export function cuerpoPronostico(p: { enDetalle: boolean; vista: 'vendedor' | 'mes'; cuota: number; abiertas: number; ganadas: number }): CuerpoPronostico {
  if (!p.enDetalle && p.cuota <= 0) return 'sinCuotas';
  if (!p.enDetalle && p.abiertas === 0 && p.ganadas === 0) return 'sinOportunidades';
  if (p.vista === 'mes') return 'meses';
  return p.enDetalle ? 'oportunidades' : 'vendedores';
}

/** Minutos enteros desde la última carga («actualizado hace 5 min»). */
export function minutosDesde(desde: number, ahora: number): number {
  return Math.max(0, Math.floor((ahora - desde) / 60_000));
}

/** «2026-10» → «octubre 2026» en el idioma de la interfaz (mediodía UTC: sin corrimiento de día). */
export function etiquetaMes(mes: string, idioma: string): string {
  const fecha = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1, 12));
  return new Intl.DateTimeFormat(idioma, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fecha);
}

type Celda = string | number | null;
type ConTotal = { total: number };

/** Filas del CSV «por vendedor»: montos sin formato (Excel suma). */
export function filasCsvVendedores(
  filas: readonly { userId: string | null; quota: ConTotal; won: ConTotal; commit: ConTotal; adjustment: ConTotal; bestCase: ConTotal; weighted: ConTotal; coverage: number | null }[],
  nombre: (userId: string | null) => string,
): Celda[][] {
  return filas.map((f) => [nombre(f.userId), f.quota.total || null, f.won.total, f.commit.total, f.adjustment.total || null, f.bestCase.total, f.weighted.total, f.coverage === null ? null : Math.round(f.coverage * 100)]);
}

export function filasCsvOportunidades(
  filas: readonly { name: string; stage_name: string; expected_close_date: string | null; amount: number | string | null; currency: string | null; probability: number | null; category: string }[],
  categoria: (c: string) => string,
  probabilidad: (p: number | null) => number,
): Celda[][] {
  return filas.map((o) => [o.name, o.stage_name, o.expected_close_date, Number(o.amount ?? 0), o.currency, probabilidad(o.probability), categoria(o.category)]);
}

export function filasCsvMeses(meses: readonly { mes: string; oportunidades: number; won: ConTotal; commit: ConTotal; bestCase: ConTotal; weighted: ConTotal }[]): Celda[][] {
  return meses.map((m) => [m.mes, m.won.total, m.commit.total, m.bestCase.total, m.weighted.total, m.oportunidades]);
}

/** Símbolo corto de la moneda («$», «€»); sin soporte de Intl, el código. */
export function simboloMoneda(code: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
