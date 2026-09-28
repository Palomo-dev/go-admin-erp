/**
 * Moneda de la organización — FUENTE ÚNICA.
 *
 * Por qué esta y no otra (auditoría del 2026-09-23). Había cinco lecturas de la
 * moneda base, con respaldos distintos:
 *   - `useOrgCurrency` (hook): `is_base`, si no 'COP'.
 *   - `getOrganizationCurrency` (catálogo de Facebook): `is_base`, si no 'COP'.
 *   - `currencyService.getBaseCurrency`: devolvía 'USD' SIEMPRE, sin leer nada.
 *   - `obtenerMonedaBase` (`openexchangerates.ts`): cadena completa, pero solo
 *     con el cliente de navegador y con registros de consola en cada llamada.
 *   - `resolveOrgCurrency` (GO Assistant): la misma cadena completa, recibe el
 *     cliente como parámetro (sirve en navegador Y en servidor, con la sesión
 *     del usuario) y devuelve los decimales del catálogo.
 * Se elige la última. Vivía en `src/lib/ai/assistant/orgCurrency.ts`; se muda
 * aquí porque no es del asistente sino del ERP, y ese archivo la reexporta.
 * Las demás delegan en ella.
 *
 * La cadena, en este orden:
 *   1. la moneda marcada `is_base` de la organización (`organization_currencies`);
 *   2. la preferencia `settings.finance.default_currency`, si la tiene asignada;
 *   3. USD, si la organización lo tiene asignado;
 *   4. la primera moneda que tenga asignada;
 *   5. la moneda del país de la organización (`organizations.country_code`):
 *      una organización colombiana sin monedas configuradas factura en COP, no
 *      en USD. Medido el 2026-09-23: 12 de 85 organizaciones no tienen moneda
 *      base, ninguna tiene otra moneda asignada.
 * Si no hay nada, 'USD' y se registra.
 *
 * El locale de formato sale del país (`localeDeOrganizacion`), ver
 * `src/lib/utils/moneda.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { paisIsoDeOrganizacion } from '@/lib/utils/telefono';
import { contextoMoneda, localeDeOrganizacion, type ContextoMoneda } from '@/lib/utils/moneda';

export interface OrgCurrency {
  /** ISO 4217, en mayúsculas. */
  code: string;
  symbol: string | null;
  /** Decimales de la moneda. El peso colombiano no tiene céntimos. */
  decimals: number;
  /** De dónde salió, para poder depurar por qué se facturó en lo que se facturó. */
  source: 'base' | 'preference' | 'usd' | 'first' | 'country' | 'fallback';
}

const FALLBACK: OrgCurrency = { code: 'USD', symbol: '$', decimals: 2, source: 'fallback' };

/**
 * Moneda de curso legal por país (alfa-2). Solo se usa como paso 5.
 *
 * ESPEJO EN SQL: `public.fn_moneda_base_organizacion` (migración
 * `20260924163000_moneda_base_por_defecto.sql`) replica esta cadena para el
 * trigger que pone la moneda base a los documentos creados sin moneda. Si
 * cambia la cadena o esta tabla, cambia también la función SQL: el test
 * `src/__tests__/services/monedaBaseSql.test.ts` falla si divergen.
 */
export const MONEDA_POR_PAIS: Readonly<Record<string, string>> = {
  CO: 'COP', MX: 'MXN', US: 'USD', CA: 'CAD', AR: 'ARS', BO: 'BOB', BR: 'BRL', CL: 'CLP',
  CR: 'CRC', CU: 'CUP', DO: 'DOP', EC: 'USD', SV: 'USD', GT: 'GTQ', HN: 'HNL', NI: 'NIO',
  PA: 'USD', PY: 'PYG', PE: 'PEN', PR: 'USD', UY: 'UYU', VE: 'VES', ES: 'EUR', PT: 'EUR',
  FR: 'EUR', DE: 'EUR', IT: 'EUR', GB: 'GBP',
};

/** Moneda del país de la organización, o null si no se reconoce. */
export function monedaDelPais(countryCode?: string | null, countryName?: string | null): string | null {
  const iso = paisIsoDeOrganizacion(countryCode, countryName);
  return iso ? MONEDA_POR_PAIS[iso] ?? null : null;
}

/** Caché por proceso: la moneda de una organización no cambia entre turnos. */
const cache = new Map<number, { value: OrgCurrency; at: number }>();
const cacheLocale = new Map<number, { value: string; at: number }>();
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
    decimals: row?.decimals ?? contextoMoneda(code).decimals,
    source,
  };
}

async function paisDeOrganizacion(
  supabase: SupabaseClient,
  organizationId: number
): Promise<{ country_code: string | null; country: string | null } | null> {
  const { data } = await supabase
    .from('organizations')
    .select('country_code, country')
    .eq('id', organizationId)
    .maybeSingle();
  return (data as { country_code: string | null; country: string | null } | null) ?? null;
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

    // 5. La moneda del país de la organización.
    const org = await paisDeOrganizacion(supabase, organizationId);
    const delPais = monedaDelPais(org?.country_code, org?.country);
    if (delPais) return await detalle(supabase, delPais, 'country');

    console.warn(
      `[moneda] La organización ${organizationId} no tiene ninguna moneda configurada ni país reconocible; se usa ${FALLBACK.code}.`
    );
    return FALLBACK;
  } catch (error) {
    // Que no se pueda leer la moneda no puede dejar sin documento al usuario.
    console.warn(
      '[moneda] No se pudo resolver la moneda de la organización:',
      error instanceof Error ? error.message : error
    );
    return FALLBACK;
  }
}

/** Locale de formato de la organización (`es-<país>`, respaldo `es-CO`). */
export async function resolveOrgLocale(supabase: SupabaseClient, organizationId: number): Promise<string> {
  const hit = cacheLocale.get(organizationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let locale: string;
  try {
    const org = await paisDeOrganizacion(supabase, organizationId);
    locale = localeDeOrganizacion(org?.country_code, org?.country);
  } catch {
    locale = localeDeOrganizacion(null);
  }
  cacheLocale.set(organizationId, { value: locale, at: Date.now() });
  return locale;
}

/**
 * Contexto de formato de la organización: moneda base + decimales + locale.
 * Si `monedaDocumento` viene (factura, cotización, pago en otra moneda) y es
 * un código válido distinto de la base, se usa ESA moneda con sus decimales.
 *
 * En servidor, `organizationId` sale de la sesión (`getServerOrgContext`),
 * nunca del body.
 */
export async function resolverContextoMoneda(
  supabase: SupabaseClient,
  organizationId: number,
  monedaDocumento?: string | null
): Promise<ContextoMoneda> {
  const [base, locale] = await Promise.all([
    resolveOrgCurrency(supabase, organizationId),
    resolveOrgLocale(supabase, organizationId),
  ]);
  const doc = (monedaDocumento ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(doc) && doc !== base.code) {
    return contextoMoneda(doc, { locale });
  }
  return contextoMoneda(base.code, { decimals: base.decimals, locale });
}

/** Invalida la caché (tras cambiar la moneda base o el país). Y para tests. */
export function resetOrgCurrencyCache(): void {
  cache.clear();
  cacheLocale.clear();
}
