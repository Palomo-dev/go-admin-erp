import type { TonoBadge } from "@/components/kit/estadoTono";
import { rankTiers, type TierLike } from "@/lib/services/crm/partnerTierFor";
export function partnerTierTone(
  id: string | null,
  tiers: readonly TierLike[],
): TonoBadge {
  const rank = rankTiers(tiers).findIndex((t) => t.id === id);
  return rank < 0
    ? "neutro"
    : (["informacion", "neutro", "advertencia", "marca"] as const)[
        Math.min(rank, 3)
      ];
}
