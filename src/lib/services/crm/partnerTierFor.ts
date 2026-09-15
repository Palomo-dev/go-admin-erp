/**
 * F12 — promoción automática de tier de partner (puro, sin I/O).
 *
 * Se evalúa al registrar un deal (`registerPartnerDeal`): el partner sube al
 * tier más alto cuyos DOS umbrales (`min_deals` y `min_revenue`) cumple con
 * sus deals no rechazados. Nunca se degrada automáticamente; bajar de tier es
 * una decisión humana en `PartnerEditor`. `partners.tier_id` no tiene FK en
 * la BD (verificado por MCP el 2026-09-15): un id huérfano se trata como «sin
 * tier».
 */

export interface TierLike {
  id: string;
  name: string;
  min_deals: number | string;
  min_revenue: number | string;
  commission_rate: number | string;
}

export interface DealStatLike {
  commission_status: string;
  /** Monto de la oportunidad enlazada (no la comisión). */
  amount: number | string | null | undefined;
}

export interface PartnerStats {
  deals: number;
  revenue: number;
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Deals y revenue acumulados, excluyendo los rechazados. */
export function partnerStats(deals: ReadonlyArray<DealStatLike>): PartnerStats {
  let count = 0;
  let revenue = 0;
  for (const d of deals) {
    if (d.commission_status === 'rejected') continue;
    count += 1;
    revenue += num(d.amount);
  }
  return { deals: count, revenue: Math.round(revenue * 100) / 100 };
}

/** De menor a mayor exigencia: por `min_revenue`, luego `min_deals`. */
export function rankTiers<T extends TierLike>(tiers: ReadonlyArray<T>): T[] {
  return [...tiers].sort((a, b) => num(a.min_revenue) - num(b.min_revenue) || num(a.min_deals) - num(b.min_deals));
}

function qualifies(stats: PartnerStats, tier: TierLike): boolean {
  return stats.deals >= num(tier.min_deals) && stats.revenue >= num(tier.min_revenue);
}

/** El tier más alto (último del ranking) cuyos dos umbrales se cumplen; `null` si ninguno. */
export function partnerTierFor<T extends TierLike>(stats: PartnerStats, tiers: ReadonlyArray<T>): T | null {
  const ranked = rankTiers(tiers);
  for (let i = ranked.length - 1; i >= 0; i -= 1) {
    if (qualifies(stats, ranked[i])) return ranked[i];
  }
  return null;
}

export interface TierPromotion<T extends TierLike = TierLike> {
  tierId: string;
  tier: T;
}

/**
 * Nuevo tier si el partner alcanza uno estrictamente más alto que el actual;
 * `null` si se queda como está (incluido el caso de no degradar).
 */
export function tierPromotion<T extends TierLike>(
  currentTierId: string | null | undefined,
  stats: PartnerStats,
  tiers: ReadonlyArray<T>,
): TierPromotion<T> | null {
  const best = partnerTierFor(stats, tiers);
  if (!best) return null;
  const ranked = rankTiers(tiers);
  const currentRank = currentTierId ? ranked.findIndex((t) => t.id === currentTierId) : -1;
  const bestRank = ranked.findIndex((t) => t.id === best.id);
  if (bestRank <= currentRank) return null;
  return { tierId: best.id, tier: best };
}
