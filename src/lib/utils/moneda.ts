/**
 * Formato de dinero de la organización. Módulo PURO (sin React ni Supabase):
 * lo usan los documentos que se imprimen o exportan (PDF, tickets, CSV, .txt),
 * en el navegador y en el servidor.
 *
 * Regla del dueño (2026-09-23): ningún documento supone pesos colombianos. Los
 * montos van en la moneda DEL DOCUMENTO (factura, cotización, pago en otra
 * moneda) o, si el documento no trae moneda, en la moneda BASE de la
 * organización. «COP» solo aparece porque la organización lo escogió.
 *
 * - Moneda base: la resuelve `resolveOrgCurrency` en
 *   `src/lib/services/monedaOrganizacion.ts` (`organization_currencies.is_base`
 *   con su cadena de respaldo). Aquí solo se formatea.
 * - Locale: sale del país de la organización (`organizations.country_code`,
 *   alfa-3 en la base; ver `paisIsoDeOrganizacion`) como `es-<país>`: la
 *   interfaz sigue en español, pero los separadores son los del país
 *   (`$1,234.50` en México, `1.234,50 €` en España). Respaldo: `es-CO`.
 * - Decimales: los del catálogo `currencies.decimals` cuando se conocen
 *   (COP y CLP tienen 0 en la base); si no, la convención de la tabla de abajo
 *   y, al final, la de ISO 4217 que trae `Intl`.
 */

import { paisIsoDeOrganizacion } from '@/lib/utils/telefono';

/** Locale de respaldo cuando la organización no tiene país reconocible. */
export const LOCALE_RESPALDO = 'es-CO';

/**
 * Monedas sin fracción en el uso diario aunque ISO 4217 les asigne dos
 * decimales. Es el mismo criterio que `currencies.decimals` en la base
 * (verificado el 2026-09-23: COP 0, CLP 0, USD 2, EUR 2, MXN 2): esta tabla
 * solo cubre el caso en que el catálogo no se pudo leer.
 */
const SIN_DECIMALES = new Set(['COP', 'CLP', 'PYG', 'JPY', 'KRW', 'VND', 'ISK', 'UGX', 'XAF', 'XOF']);

/** Contexto de formato de un documento: moneda, decimales y locale. */
export interface ContextoMoneda {
  /** ISO 4217 en mayúsculas. */
  code: string;
  decimals: number;
  locale: string;
}

/** Normaliza un código ISO 4217 (`currencies.code` es `character` y viene con relleno). */
export function normalizarCodigoMoneda(code: string | null | undefined): string | null {
  const limpio = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(limpio) ? limpio : null;
}

/**
 * Moneda con la que se pinta un documento: la suya si la trae y es válida;
 * si no, la base de la organización.
 */
export function monedaDelDocumento(monedaDocumento: string | null | undefined, monedaBase: string): string {
  return normalizarCodigoMoneda(monedaDocumento) ?? normalizarCodigoMoneda(monedaBase) ?? monedaBase;
}

/** Locale de formato a partir del país de la organización (alfa-2, alfa-3 o nombre). */
export function localeDeOrganizacion(countryCode?: string | null, countryName?: string | null): string {
  const iso = paisIsoDeOrganizacion(countryCode, countryName);
  if (!iso) return LOCALE_RESPALDO;
  const candidato = `es-${iso}`;
  try {
    return Intl.NumberFormat.supportedLocalesOf([candidato]).length > 0 ? candidato : LOCALE_RESPALDO;
  } catch {
    return LOCALE_RESPALDO;
  }
}

/** Decimales de una moneda: catálogo > convención > ISO 4217 (`Intl`). */
export function decimalesDeMoneda(code: string, decimalesCatalogo?: number | null): number {
  if (typeof decimalesCatalogo === 'number' && Number.isInteger(decimalesCatalogo) && decimalesCatalogo >= 0) {
    return decimalesCatalogo;
  }
  const iso = normalizarCodigoMoneda(code);
  if (!iso) return 2;
  if (SIN_DECIMALES.has(iso)) return 0;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: iso }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Arma el contexto de formato completo. */
export function contextoMoneda(
  code: string,
  opciones: { decimals?: number | null; locale?: string | null } = {}
): ContextoMoneda {
  const iso = normalizarCodigoMoneda(code) ?? code;
  return {
    code: iso,
    decimals: decimalesDeMoneda(iso, opciones.decimals),
    locale: opciones.locale || LOCALE_RESPALDO,
  };
}

function aNumero(valor: number | string | null | undefined): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formatea un importe. `moneda` puede ser un código suelto o un
 * `ContextoMoneda`; `opciones` permite forzar decimales o locale.
 * Un código que `Intl` no conoce no rompe el documento: sale `1.000 XYZ`.
 */
export function formatMoneda(
  valor: number | string | null | undefined,
  moneda: ContextoMoneda | string,
  opciones: { decimals?: number; locale?: string } = {}
): string {
  const ctx = typeof moneda === 'string' ? contextoMoneda(moneda) : moneda;
  const decimals = opciones.decimals ?? ctx.decimals;
  const locale = opciones.locale ?? ctx.locale;
  const n = aNumero(valor);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ctx.code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    let numero: string;
    try {
      numero = n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    } catch {
      numero = n.toFixed(decimals);
    }
    return `${numero} ${ctx.code}`;
  }
}

/** Devuelve una función de formato fija para un contexto (útil en tablas y bucles). */
export function crearFormateadorMoneda(
  moneda: ContextoMoneda | string,
  opciones: { decimals?: number; locale?: string } = {}
): (valor: number | string | null | undefined) => string {
  const ctx = typeof moneda === 'string' ? contextoMoneda(moneda) : moneda;
  const decimals = opciones.decimals ?? ctx.decimals;
  const locale = opciones.locale ?? ctx.locale;
  let intl: Intl.NumberFormat | null = null;
  try {
    intl = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ctx.code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    intl = null;
  }
  return (valor) => (intl ? intl.format(aNumero(valor)) : formatMoneda(valor, ctx, { decimals, locale }));
}

/**
 * Número sin símbolo, con los decimales y separadores de la moneda: para
 * columnas de CSV que llevan la moneda en el encabezado (`Total (MXN)`).
 */
export function formatNumeroMoneda(valor: number | string | null | undefined, moneda: ContextoMoneda | string): string {
  const ctx = typeof moneda === 'string' ? contextoMoneda(moneda) : moneda;
  const n = aNumero(valor);
  try {
    return new Intl.NumberFormat(ctx.locale, {
      minimumFractionDigits: ctx.decimals,
      maximumFractionDigits: ctx.decimals,
    }).format(n);
  } catch {
    return n.toFixed(ctx.decimals);
  }
}
