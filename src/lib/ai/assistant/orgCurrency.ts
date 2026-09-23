/**
 * GO Assistant — moneda de la organización.
 *
 * El asistente tenía `'COP'` cableado en el contexto y en la RPC de ventas. Para
 * una organización que factura en dólares eso no es un detalle de formato: le
 * escribía `payments.currency = 'COP'` con un importe en USD, y a partir de ahí
 * la conciliación y los informes mienten.
 *
 * La resolución de la moneda base (`resolveOrgCurrency`) nació aquí y el
 * 2026-09-23 se mudó a `src/lib/services/monedaOrganizacion.ts`, la fuente
 * única del ERP: la usan también los documentos PDF, tickets y exportaciones.
 * Se reexporta para no mover los imports del asistente. El formato vive en
 * `src/lib/utils/moneda.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatMoneda } from '@/lib/utils/moneda';
import type { OrgCurrency } from '@/lib/services/monedaOrganizacion';

export { resolveOrgCurrency, resetOrgCurrencyCache } from '@/lib/services/monedaOrganizacion';
export type { OrgCurrency } from '@/lib/services/monedaOrganizacion';

/** Formatea un importe en la moneda de la organización. */
export function formatMoney(value: number, currency: OrgCurrency | string): string {
  if (typeof currency === 'string') return formatMoneda(value, currency);
  return formatMoneda(value, currency.code, { decimals: currency.decimals });
}

// ─── Conversión entre monedas ────────────────────────────────────────────────
//
// Política decidida el 2026-09-15: **tasa del día de openexchangerates**, la
// que ya guarda el cron del ERP en `currency_rates` (base USD, una fila por
// moneda y día). No hay tasa fija por organización: si el usuario dicta un
// importe en otra moneda, se convierte a la de la organización con la tasa del
// día de la operación y se le enseña la tasa usada. Todo lo que se escribe en
// la base va en la moneda de la organización.

export interface Conversion {
  amount: number;
  from: string;
  to: string;
  result: number;
  /** Unidades de `to` por una unidad de `from`. */
  rate: number;
  /** Fecha de la tasa usada (puede ser anterior a la pedida si ese día no hay). */
  rateDate: string;
  /** `true` si no había tasa para la fecha pedida y se usó la última anterior. */
  stale: boolean;
}

export class ConversionError extends Error {
  code: 'unknown_currency' | 'no_rate';
  constructor(code: ConversionError['code'], message: string) {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
  }
}

/** Última tasa (USD → code) con fecha ≤ la pedida. */
async function tasaUsd(
  supabase: SupabaseClient,
  code: string,
  date: string
): Promise<{ rate: number; rateDate: string } | null> {
  if (code === 'USD') return { rate: 1, rateDate: date };
  const { data } = await supabase
    .from('currency_rates')
    .select('rate, rate_date')
    .eq('base_currency_code', 'USD')
    // `code` es `character varying` aquí, sin relleno; se compara tal cual.
    .eq('code', code)
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { rate: number; rate_date: string } | null;
  if (!row || !Number.isFinite(Number(row.rate)) || Number(row.rate) <= 0) return null;
  return { rate: Number(row.rate), rateDate: row.rate_date };
}

/**
 * Convierte `amount` de `from` a `to` con la tasa del día `date`. La fecha la
 * pone el llamador en la zona de la organización: derivar "hoy" aquí con
 * `toISOString()` sería el día UTC, el bug sistémico de fechas del repo.
 * Las tasas están en base USD: se pasa por USD en medio.
 */
export async function convertAmount(
  supabase: SupabaseClient,
  amount: number,
  from: string,
  to: string,
  /** Día calendario `YYYY-MM-DD` EN LA ZONA DE LA ORGANIZACIÓN (`todayInTz`). */
  date: string
): Promise<Conversion> {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ConversionError('unknown_currency', 'La fecha de la tasa debe ser YYYY-MM-DD.');
  }
  const day = date;
  if (!/^[A-Z]{3}$/.test(f) || !/^[A-Z]{3}$/.test(t)) {
    throw new ConversionError('unknown_currency', 'Los códigos de moneda deben ser ISO de tres letras (COP, USD, EUR…).');
  }
  if (f === t) return { amount, from: f, to: t, result: amount, rate: 1, rateDate: day, stale: false };

  const [rf, rt] = await Promise.all([tasaUsd(supabase, f, day), tasaUsd(supabase, t, day)]);
  if (!rf) throw new ConversionError('no_rate', `No tengo tasa de cambio para ${f}.`);
  if (!rt) throw new ConversionError('no_rate', `No tengo tasa de cambio para ${t}.`);

  const rate = rt.rate / rf.rate;
  const rateDate = rf.rateDate < rt.rateDate ? rf.rateDate : rt.rateDate;
  return {
    amount,
    from: f,
    to: t,
    result: Math.round(amount * rate * 10000) / 10000,
    rate,
    rateDate,
    stale: rateDate !== day,
  };
}
