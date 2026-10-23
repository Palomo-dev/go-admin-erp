/**
 * El cobro rechaza un descuento de cabecera que no es la suma de las líneas.
 * Un carrito viejo podía guardar el descuento manual solo en `discount_total`.
 */

export function descuentoDesdeLineas(
  items: ReadonlyArray<{ discount_amount?: number | null }>,
): number {
  const suma = items.reduce((acc, item) => acc + (Number(item.discount_amount) || 0), 0);
  return Math.round(suma * 100) / 100;
}

/** Cabecera alineada con las líneas. No reparte un descuento que no esté en ellas. */
export function cuadrarDescuentoCabecera<T extends {
  discount_total?: number | null;
  discount_amount?: number | null;
  items?: ReadonlyArray<{ discount_amount?: number | null }> | null;
}>(cart: T): T {
  const items = cart.items ?? [];
  const suma = descuentoDesdeLineas(items);
  const total = Number(cart.discount_total) || 0;
  const amount = Number(cart.discount_amount) || 0;
  if (Math.abs(total - suma) < 0.005 && Math.abs(amount - suma) < 0.005) return cart;
  return { ...cart, discount_total: suma, discount_amount: suma };
}
