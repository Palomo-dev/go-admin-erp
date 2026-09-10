/**
 * Precios unitarios de proveedores desde `provider_pricing` (D6: sin hardcode).
 *
 * - `getUnitCost(provider, sku)`: USD por unidad vigente hoy (cache 5 min).
 * - `estimateCost(items)`: suma de `quantity * unit_cost` por línea.
 *
 * Si la tabla aún no existe (DB F0 M7 pendiente) o el sku no está, devuelve
 * `null` y `estimateCost` marca la línea como `priced=false` (nunca inventa).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PricingRow {
  provider: string;
  sku: string;
  unit: string;
  unit_cost_usd: number;
  /** Créditos internos por unidad (columna real de provider_pricing, DB F0). */
  credits_per_unit: number | null;
  currency: string;
  valid_from: string;
  verified: boolean;
}

export interface CostItem {
  provider: string;
  sku: string;
  quantity: number;
}

export interface CostLine extends CostItem {
  unit_cost_usd: number | null;
  cost_usd: number;
  priced: boolean;
}

export interface CostEstimate {
  total_usd: number;
  lines: CostLine[];
  /** false si alguna línea no tiene precio. */
  complete: boolean;
}

export const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: number | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
let clientFactory: (() => SupabaseClient) | null = null;

/** Inyección del cliente (tests). En runtime se usa el service client. */
export function __setPricingClientFactory(factory: (() => SupabaseClient) | null): void {
  clientFactory = factory;
}

export function clearPricingCache(): void {
  cache.clear();
}

async function resolveClient(): Promise<SupabaseClient> {
  if (clientFactory) return clientFactory();
  const mod = await import('@/lib/supabase/server-service');
  return mod.getServiceClient();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Costo unitario vigente (USD) o `null` si no hay precio.
 */
export async function getUnitCost(provider: string, sku: string): Promise<number | null> {
  const key = `${provider}:${sku}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;

  let value: number | null = null;
  try {
    const sb = await resolveClient();
    const today = todayIso();
    // Schema real (DB F0 r1): sin valid_to; vigente = valid_from más reciente <= hoy.
    const { data, error } = await sb
      .from('provider_pricing')
      .select('unit_cost_usd, valid_from')
      .eq('provider', provider)
      .eq('sku', sku)
      .lte('valid_from', today)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`[pricing] provider_pricing no disponible (${error.code ?? ''}): ${error.message}`);
    } else if (data && data.unit_cost_usd != null) {
      value = Number(data.unit_cost_usd);
    }
  } catch (err) {
    console.warn('[pricing] Error consultando provider_pricing:', err instanceof Error ? err.message : err);
  }

  cache.set(key, { value, expiresAt: now + PRICING_CACHE_TTL_MS });
  return value;
}

/**
 * Estima el costo total de una lista de consumos.
 */
export async function estimateCost(items: CostItem[]): Promise<CostEstimate> {
  const lines: CostLine[] = [];
  let total = 0;
  let complete = true;
  for (const item of items) {
    const unit = await getUnitCost(item.provider, item.sku);
    const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0;
    const cost = unit == null ? 0 : round6(unit * qty);
    if (unit == null) complete = false;
    total += cost;
    lines.push({ ...item, quantity: qty, unit_cost_usd: unit, cost_usd: cost, priced: unit != null });
  }
  return { total_usd: round6(total), lines, complete };
}

/** Lista completa de precios vigentes (para la pestaña Créditos). */
export async function listPricing(): Promise<PricingRow[]> {
  try {
    const sb = await resolveClient();
    const today = todayIso();
    const { data, error } = await sb
      .from('provider_pricing')
      .select('provider, sku, unit, unit_cost_usd, credits_per_unit, currency, valid_from, verified')
      .lte('valid_from', today)
      .order('provider')
      .order('sku')
      .order('valid_from', { ascending: false });
    if (error || !data) return [];
    // Una fila por (provider, sku): la de valid_from más reciente.
    const seen = new Set<string>();
    const out: PricingRow[] = [];
    for (const r of data as PricingRow[]) {
      const k = `${r.provider}:${r.sku}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...r, unit_cost_usd: Number(r.unit_cost_usd), credits_per_unit: r.credits_per_unit == null ? null : Number(r.credits_per_unit) });
    }
    return out;
  } catch {
    return [];
  }
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Helpers de unidades → cantidad facturable. */
export const units = {
  minutes: (seconds: number): number => Math.ceil(Math.max(0, seconds) / 60),
  hours: (seconds: number): number => Math.max(0, seconds) / 3600,
  char1k: (chars: number): number => Math.max(0, chars) / 1000,
  tokens1m: (tokens: number): number => Math.max(0, tokens) / 1_000_000,
};
