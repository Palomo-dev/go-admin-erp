/**
 * Cobro de una venta que ya existe (deuda o mesa). Los descuentos ya quedaron
 * en sus líneas: el cobro no los vuelve a calcular. La mesa los recalcula
 * mientras la cuenta sigue abierta.
 */
export function esCobroDeVentaExistente(
  settle: { sale_id?: string | null } | null | undefined,
  cart: { sale_id?: string | null; invoice_id?: string | null },
): boolean {
  return !!(settle?.sale_id || (cart.sale_id && cart.invoice_id));
}
