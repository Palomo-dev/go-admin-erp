/**
 * «Duplicar venta»: las líneas que se llevan al POS como base de una venta
 * nueva (V-g de docs/implementacion/CAJAS-VENTAS-PLAN.md). Módulo hoja.
 *
 * Antes `NuevaVentaPage` agregaba cada línea con cantidad 1 y el pedido web
 * llegaba vacío (V14). Ahora se conserva la cantidad (las variantes son
 * productos propios en `sale_items.product_id`). El PRECIO no se copia: el POS
 * pone el precio vigente del producto (`src/lib/pos/precioVigente.ts`) y
 * `pos_checkout_v1` lo valida en el servidor. Tampoco se copian descuentos ni
 * impuestos de la venta original: se recalculan con las reglas de hoy.
 */

export interface LineaOriginal {
  product_id?: number | string | null;
  quantity?: number | string | null;
  products?: { name?: string | null } | null;
}

export interface LineaDuplicada {
  product_id: number;
  quantity: number;
  /** Nombre para mostrar mientras el POS carga el producto. */
  nombre: string | null;
}

export interface ResultadoDuplicado {
  lineas: LineaDuplicada[];
  /** Líneas que no se pudieron llevar (sin producto: ítem manual, cantidad inválida). */
  omitidas: number;
}

/** Agrupa por producto sumando cantidades (máx. 3 decimales). */
export function lineasDuplicadas(items: readonly LineaOriginal[] | null | undefined): ResultadoDuplicado {
  const mapa = new Map<number, LineaDuplicada>();
  let omitidas = 0;
  for (const it of items ?? []) {
    const producto = Number(it.product_id);
    const cantidad = Number(it.quantity);
    if (!Number.isInteger(producto) || producto <= 0 || !Number.isFinite(cantidad) || cantidad <= 0) {
      omitidas++;
      continue;
    }
    const actual = mapa.get(producto);
    if (actual) {
      actual.quantity = Math.round((actual.quantity + cantidad) * 1000) / 1000;
    } else {
      mapa.set(producto, { product_id: producto, quantity: Math.round(cantidad * 1000) / 1000, nombre: it.products?.name ?? null });
    }
  }
  return { lineas: [...mapa.values()], omitidas };
}

/** Clave de `sessionStorage` con que el POS recibe las líneas a duplicar. */
export const CLAVE_DUPLICAR_VENTA = 'pos.duplicarVenta';
