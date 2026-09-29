/**
 * Cantidades de las páginas generales de Stock, Movimientos, Kardex y Lotes
 * con la unidad del producto (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.4):
 * un producto por peso o medida se lee «12,400 kg» y no «12,4 uds».
 *
 * Puro (sin React ni Supabase): lo usan `useModosVenta` y los tests. La regla
 * es la misma del detalle del producto (`useCantidad` de
 * `detalle/inventario/stock/useFormatoInventario.ts`) y del POS
 * (`formatoCantidad` de `@/lib/pos/peso`): una sola.
 */

import { formatearCantidad } from '@/components/kit/inventario/SaldoCorridoCell';
import { localeIntl } from '@/components/kit/idioma';
import { esMedido, formatoCantidad, type ProductoModoVenta } from '@/lib/pos/peso/modoVenta';

/** «Cómo se vende» por producto (solo los que la página tiene a la vista). */
export type ModosVenta = ReadonlyMap<number, ProductoModoVenta>;

/** ¿La cantidad de este producto lleva su unidad («kg»)? */
export function productoMedido(modos: ModosVenta, productId: number | null | undefined): boolean {
  return productId != null && esMedido(modos.get(productId));
}

/**
 * Cantidad de un producto. Por peso o medida: «12,400 kg» (decimales y
 * unidad del producto). Por unidad: el número del idioma pasado por
 * `conUnidades` («12 uds», o solo «12» si no se da).
 */
export function textoCantidadProducto(
  n: number | null | undefined,
  modo: ProductoModoVenta | null | undefined,
  locale: string,
  conUnidades?: (numero: string) => string,
): string {
  const valor = Number(n) || 0;
  if (esMedido(modo)) {
    try {
      return formatoCantidad(valor, modo, localeIntl(locale));
    } catch {
      return String(valor);
    }
  }
  const numero = formatearCantidad(valor, locale);
  return conUnidades ? conUnidades(numero) : numero;
}

/** Ids únicos y válidos de las filas, ordenados (clave estable para consultar). */
export function idsProductos(filas: ReadonlyArray<{ product_id?: number | null }>): number[] {
  const ids = new Set<number>();
  for (const f of filas) {
    const id = Number(f.product_id);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return Array.from(ids).sort((a, b) => a - b);
}
