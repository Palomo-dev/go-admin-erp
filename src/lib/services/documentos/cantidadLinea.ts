/**
 * Cantidad de una línea de documento (factura de venta y de compra, orden de
 * compra, recepción, PDF) según «cómo se vende» el producto
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.1 y §9).
 *
 * Cada línea lleva SUS decimales y SU unidad, tomados del producto: una línea
 * de queso por kg admite 0,735 aunque las demás sean enteras, y dice «kg».
 * Las reglas (decimales, símbolo, redondeo) son las de `modoVenta.ts`, espejo
 * de `fn_producto_decimales_cantidad`; aquí solo se adaptan a la línea
 * (regla 7 de CLAUDE.md: nada de lógica duplicada). Puro: sin React ni red.
 */
import { redondearCantidad } from '@/lib/inventario/nucleo/costo';
import {
  decimalesCantidad,
  esMedido,
  redondearCantidadProducto,
  unidadVisible,
  type ProductoModoVenta,
} from '@/lib/pos/peso/modoVenta';

/** Columnas de `products` que deciden la cantidad de la línea (para los `select` embebidos). */
export const COLUMNAS_CANTIDAD_PRODUCTO = 'sale_mode, qty_decimals, unit_code';

export interface CantidadLinea {
  /** Símbolo de la unidad de venta («kg», «lb», «m», «L»); `null` en productos por unidad. */
  unidad: string | null;
  /**
   * Decimales de la cantidad de un producto por peso o medida (3 en kg, 2 en
   * metros). `null` = producto por unidad o ítem manual: sin regla propia, la
   * línea conserva el comportamiento de siempre.
   */
  decimalesCantidad: number | null;
}

export const CANTIDAD_SIN_REGLA: CantidadLinea = Object.freeze({ unidad: null, decimalesCantidad: null });

/** Unidad y decimales de la línea según el producto (solo peso y medida los fijan). */
export function cantidadLineaDeProducto(p: ProductoModoVenta | null | undefined): CantidadLinea {
  if (!esMedido(p)) return CANTIDAD_SIN_REGLA;
  return { unidad: unidadVisible(p), decimalesCantidad: decimalesCantidad(p) };
}

/**
 * Cantidad con que nace una línea al agregar el producto.
 *
 * - Por unidad: el mínimo del proveedor si lo hay (orden de compra) o 1, como
 *   siempre.
 * - Por peso o medida: el mínimo (redondeado a los decimales del producto) si
 *   lo hay; si no, **0**. Un «1 kg» puesto por defecto no es una cantidad real:
 *   la línea queda con el campo vacío y la unidad («kg») para que se escriba
 *   el peso, y el formulario no deja guardar una cantidad 0.
 */
export function cantidadInicialLinea(c: Pick<CantidadLinea, 'decimalesCantidad'>, minimo?: number | null): number {
  const m = Number(minimo);
  const hayMinimo = minimo !== null && minimo !== undefined && Number.isFinite(m) && m > 0;
  if (c.decimalesCantidad === null || c.decimalesCantidad === undefined) return hayMinimo ? m : 1;
  return hayMinimo ? redondearCantidadProducto(m, c.decimalesCantidad) : 0;
}

/**
 * Cantidad lista para guardar: a los decimales del producto por peso o medida
 * (0,7354 → 0,735, medio hacia arriba como `round` de Postgres). Sin regla
 * propia se deja igual.
 */
export function redondearCantidadLinea(cantidad: number, c: Pick<CantidadLinea, 'decimalesCantidad'>): number {
  const n = Number(cantidad) || 0;
  if (c.decimalesCantidad === null || c.decimalesCantidad === undefined) return n;
  return redondearCantidadProducto(n, c.decimalesCantidad);
}

/** Suma de cantidades sin el ruido binario (0,1 + 0,2 = 0,3), a 3 decimales como `stock_levels`. */
export function sumaCantidades(cantidades: readonly number[]): number {
  return redondearCantidad(cantidades.reduce((s, n) => s + (Number(n) || 0), 0));
}
