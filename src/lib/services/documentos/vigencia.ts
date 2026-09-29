/**
 * Vigencia de precios y costos (`product_prices`, `product_costs`): la fila
 * que rige ahora. Puro, sin Supabase.
 */
/** Fila vigente hoy de una tabla con vigencia (`effective_from` ≤ ahora < `effective_to`), la más reciente. */
export function vigente<T extends { effective_from: string | null; effective_to: string | null }>(filas: readonly T[] | null | undefined, ahora = Date.now()): T | null {
  let mejor: T | null = null;
  for (const f of filas ?? []) {
    const desde = f.effective_from ? Date.parse(f.effective_from) : 0;
    const hasta = f.effective_to ? Date.parse(f.effective_to) : Infinity;
    if (desde > ahora || hasta <= ahora) continue;
    if (!mejor || desde > (mejor.effective_from ? Date.parse(mejor.effective_from) : 0)) mejor = f;
  }
  return mejor;
}
