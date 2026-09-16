/**
 * GO Assistant — moneda de la organización.
 *
 * El asistente tenía `'COP'` cableado en el contexto y en la RPC de ventas. Para
 * una organización que factura en dólares eso no es un detalle de formato: le
 * escribía `payments.currency = 'COP'` con un importe en USD, y a partir de ahí
 * la conciliación y los informes mienten.
 *
 * El ERP ya tiene el dato: `organization_currencies.is_base` sobre el catálogo
 * `currencies`, más la integración de tasas de `openexchangerates.ts`.
 *
 * **Por qué no se reutiliza `obtenerMonedaBase()`** de ese archivo, que hace lo
 * mismo: importa `@/lib/supabase/config`, el cliente de NAVEGADOR, y no se puede
 * llamar desde un route handler — el mismo problema que tienen `posService` y
 * compañía. Aquí se repite la cadena de respaldo con el cliente de sesión.
 *
 * La cadena es la de siempre, en este orden:
 *   1. la moneda marcada `is_base` de la organización;
 *   2. la preferencia `settings.finance.default_currency`;
 *   3. USD, si la organización lo tiene asignado;
 *   4. la primera moneda que tenga asignada.
 * Si no hay ninguna, se devuelve `USD` y se registra: es el mismo último
 * recurso que usa el resto del ERP, y adivinar otra cosa sería peor.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrgCurrency {
  /** ISO 4217, en mayúsculas. */
  code: string;
  symbol: string | null;
  /** Decimales de la moneda. El peso colombiano no tiene céntimos. */
  decimals: number;
  /** De dónde salió, para poder depurar por qué se facturó en lo que se facturó. */
  source: 'base' | 'preference' | 'usd' | 'first' | 'fallback';
}

const FALLBACK: OrgCurrency = { code: 'USD', symbol: '$', decimals: 2, source: 'fallback' };

/** Caché por proceso: la moneda de una organización no cambia entre turnos. */
const cache = new Map<number, { value: OrgCurrency; at: number }>();
const TTL_MS = 5 * 60 * 1000;

async function detalle(
  supabase: SupabaseClient,
  code: string,
  source: OrgCurrency['source']
): Promise<OrgCurrency> {
  const { data } = await supabase
    .from('currencies')
    .select('code, symbol, decimals')
    .eq('code', code)
    .maybeSingle();

  const row = data as { code: string; symbol: string | null; decimals: number | null } | null;
  return {
    // `currencies.code` es `character`, o sea que viene con relleno a la
    // derecha: sin recortarlo, 'COP ' no coincide con nada.
    code: (row?.code ?? code).trim().toUpperCase(),
    symbol: row?.symbol ?? null,
    decimals: row?.decimals ?? 2,
    source,
  };
}

export async function resolveOrgCurrency(
  supabase: SupabaseClient,
  organizationId: number
): Promise<OrgCurrency> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const resolved = await resolveSinCache(supabase, organizationId);
  cache.set(organizationId, { value: resolved, at: Date.now() });
  return resolved;
}

async function resolveSinCache(supabase: SupabaseClient, organizationId: number): Promise<OrgCurrency> {
  try {
    // 1. La moneda marcada como base.
    const { data: base } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', organizationId)
      .eq('is_base', true)
      .maybeSingle();

    const baseCode = (base as { currency_code: string } | null)?.currency_code?.trim();
    if (baseCode) return await detalle(supabase, baseCode, 'base');

    // 2. La preferencia de la organización.
    const { data: prefs } = await supabase
      .from('organization_preferences')
      .select('settings')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const preferida = (prefs as { settings?: { finance?: { default_currency?: string } } } | null)
      ?.settings?.finance?.default_currency?.trim();
    if (preferida) {
      const { data: asignada } = await supabase
        .from('organization_currencies')
        .select('currency_code')
        .eq('organization_id', organizationId)
        .eq('currency_code', preferida)
        .maybeSingle();
      // Solo si la organización la tiene asignada: una preferencia que apunta a
      // una moneda que no maneja no es una preferencia, es un dato viejo.
      if (asignada) return await detalle(supabase, preferida, 'preference');
    }

    // 3-4. USD si lo tiene, si no la primera que tenga.
    const { data: asignadas } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    const codigos = ((asignadas ?? []) as Array<{ currency_code: string }>)
      .map((r) => r.currency_code?.trim())
      .filter(Boolean);

    if (codigos.includes('USD')) return await detalle(supabase, 'USD', 'usd');
    if (codigos.length > 0) return await detalle(supabase, codigos[0], 'first');

    console.warn(
      `[GO Assistant] La organización ${organizationId} no tiene ninguna moneda configurada; se usa ${FALLBACK.code}.`
    );
    return FALLBACK;
  } catch (error) {
    // Que no se pueda leer la moneda no puede dejar mudo al asistente.
    console.warn(
      '[GO Assistant] No se pudo resolver la moneda de la organización:',
      error instanceof Error ? error.message : error
    );
    return FALLBACK;
  }
}

/** Solo para tests. */
export function resetOrgCurrencyCache(): void {
  cache.clear();
}

/** Formatea un importe en la moneda de la organización. */
export function formatMoney(value: number, currency: OrgCurrency | string): string {
  const code = typeof currency === 'string' ? currency : currency.code;
  const decimals = typeof currency === 'string' ? undefined : currency.decimals;
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    // Un código que `Intl` no conoce no debe romper la tarjeta.
    return `${value.toLocaleString('es-CO')} ${code}`;
  }
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
