'use client';

import { Coins, Loader2 } from 'lucide-react';

export interface CostLike { unit_cost_usd: number | null; label: string; free: boolean; priced: boolean }

/** Costo estimado por mensaje (provider_pricing, D6) o por campaña (unit × pending). */
export function CostEstimate({ cost, loading, count }: { cost: CostLike | null; loading?: boolean; count?: number }) {
  if (loading) return <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Calculando costo…</p>;
  if (!cost) return null;
  const total = count && cost.unit_cost_usd !== null ? cost.unit_cost_usd * count : null;
  return (
    <p className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1" aria-live="polite">
      <Coins className="h-3 w-3 text-amber-500" aria-hidden="true" />
      <span>Costo: {cost.free ? 'gratis (dentro de la ventana)' : cost.label}{total !== null ? ` · total ≈ $${total.toFixed(4)} USD (${count} contactos)` : ''}</span>
    </p>
  );
}
