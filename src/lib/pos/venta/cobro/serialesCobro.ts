/**
 * Seriales obligatorios del cobro del POS (POS-PLAN §2.6, L48), movidos
 * LITERALMENTE de `CheckoutDialog.tsx`: una línea de un producto con
 * `track_serial` exige elegir exactamente tantos seriales como unidades antes
 * de completar la venta (si faltan, «Completar venta» abre el selector).
 */

export interface LineaConSerial {
  product_id: number;
  quantity: number;
  product?: { track_serial?: boolean } | null;
}

/** Líneas del carrito cuyo producto lleva seriales. */
export function lineasConSerial<T extends LineaConSerial>(items: T[]): T[] {
  return items.filter(
    (item) => item.product?.track_serial === true
  );
}

/** ¿Cada línea con seriales tiene tantos elegidos como unidades? (sin líneas: sí). */
export function seleccionSerialesCompleta(
  serializedItems: LineaConSerial[],
  serialSelections: Record<number, number[]>,
): boolean {
  return serializedItems.every(
    (item) => (serialSelections[item.product_id]?.length ?? 0) === item.quantity
  );
}
