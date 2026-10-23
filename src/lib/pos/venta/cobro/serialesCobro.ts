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

/**
 * La organización puede pedir el serial al agregar el producto. Apagado, el
 * cobro sigue preguntando al completar la venta.
 */
export function debePedirSerialAlAgregar(
  pedir: boolean,
  product: { track_serial?: boolean | null } | null | undefined,
): boolean {
  return pedir === true && product?.track_serial === true;
}

/** Seriales ya elegidos en el carrito, agrupados por producto como el cobro. */
export function seleccionesDesdeLineas(
  items: readonly { product_id: number; product?: { track_serial?: boolean | null } | null; serial_ids?: number[] }[],
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const item of items) {
    if (item.product?.track_serial !== true || !item.serial_ids?.length) continue;
    const prev = out[item.product_id] ?? [];
    const ids = item.serial_ids.filter((id) => Number.isInteger(id) && id > 0 && !prev.includes(id));
    if (prev.length === 0 && ids.length === 0) continue;
    out[item.product_id] = [...prev, ...ids];
  }
  return out;
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
