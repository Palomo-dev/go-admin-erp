/**
 * F14 — formato de cifras del panel Revenue OS (puro).
 * Los meses llegan como `date` (YYYY-MM-DD, primer día): se formatean con
 * `formatPlainDate` (no convierte zona). `null` nunca se pinta como 0.
 *
 * Moneda (r2): el símbolo sale de `organization_currencies.is_base`, que el
 * panel recibe en `dashboard.currency`. Nunca hay un «COP» por defecto: sin
 * moneda base la cifra se pinta sin símbolo y la página lo avisa
 * (`SIN_MONEDA`). Por eso `currency` es obligatorio en `fmtMoney`.
 */

import { formatPlainDate } from '@/lib/utils/dateDisplay';

export const SIN_DATOS = 'Sin datos';
export const SIN_MONEDA = 'La organización no tiene moneda base configurada: las cifras se muestran sin símbolo de moneda.';

const LOCALE = 'es-CO';

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SIN_DATOS;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

/** Cifra redondeada en la moneda base; sin moneda base, número sin símbolo (ver `SIN_MONEDA`). */
export function fmtMoney(value: number | null | undefined, currency: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SIN_DATOS;
  const rounded = Math.round(value);
  if (!currency) return fmtNumber(rounded);
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(rounded);
  } catch {
    // Código que Intl no reconoce (fila corrupta): número + código, sin inventar símbolo.
    return `${fmtNumber(rounded)} ${currency}`;
  }
}

/** Compacto para ejes y etiquetas de gráfico: 1.2 M, 850 k. */
export function fmtMoneyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} mil M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(Math.round(value));
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SIN_DATOS;
  return `${value.toFixed(digits).replace('.', ',')} %`;
}

export function fmtDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SIN_DATOS;
  return `${Math.round(value)} d`;
}

export function fmtRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SIN_DATOS;
  return `${value.toFixed(1).replace('.', ',')}×`;
}

/** «1 oportunidad ganada» / «3 oportunidades ganadas»: sin plurales rotos. */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${fmtNumber(n)} ${n === 1 ? singular : pluralForm}`;
}

/** «sep 2026» a partir de YYYY-MM-DD (o YYYY-MM). */
export function fmtMonth(plain: string): string {
  const day = plain.length === 7 ? `${plain}-01` : plain;
  const label = formatPlainDate(day, { month: 'short', year: 'numeric' });
  return label.replace('.', '');
}

/** YYYY-MM-DD → YYYY-MM para `<input type="month">`. */
export function toMonthInput(plain: string): string {
  return plain.slice(0, 7);
}
