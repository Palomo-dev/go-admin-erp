/**
 * Stock que el usuario VE en la columna "Stock" del catálogo.
 *
 * Existe porque la celda y el ordenamiento usaban números distintos:
 * la celda pinta `qty_on_hand` de la sucursal filtrada, mientras que el
 * comparador ordenaba por `producto.stock`, que suma TODAS las sucursales,
 * resta `qty_reserved` y añade además el stock de las variantes hijas.
 * Resultado: ordenar por stock devolvía secuencias sin sentido (49, 50, 47…),
 * porque se ordenaba por un valor que no estaba en pantalla.
 *
 * Esta función es la única fuente de verdad para ambas cosas.
 */

/** Fila de inventario tal y como la usa la tabla del catálogo. */
export interface NivelStock {
  branch_id: number;
  qty_on_hand: number | string;
}

/** Lo mínimo que necesita esta función de un producto. */
export interface ProductoConStock {
  track_stock?: boolean;
  stock_levels?: NivelStock[] | null;
  /** Total precalculado por el cargador; solo se usa como último recurso. */
  stock?: number;
}

/**
 * @param p producto de la tabla
 * @param branchFilter sucursal seleccionada, o `null` para "todas"
 * @returns unidades visibles, o `null` si el producto no rastrea inventario
 */
export function stockVisibleDe(
  p: ProductoConStock,
  branchFilter: number | null
): number | null {
  if (p.track_stock === false) return null;

  const niveles = p.stock_levels ?? [];
  const filtrados =
    branchFilter === null ? niveles : niveles.filter((sl) => sl.branch_id === branchFilter);

  // Sin filas para la sucursal elegida, la celda pinta 0.
  if (filtrados.length === 0) {
    return branchFilter !== null ? 0 : (p.stock ?? 0);
  }

  return filtrados.reduce((sum, sl) => sum + (Number(sl.qty_on_hand) || 0), 0);
}

/**
 * Clave de ordenación por stock. "Sin seguimiento" (`null`) va SIEMPRE al
 * final, suba o baje el orden: antes se le asignaba -1, lo que lo colaba en
 * los primeros puestos al ordenar ascendente y tapaba justo los productos
 * con inventario bajo, que es lo que se busca al ordenar así.
 */
export function claveOrdenStock(
  p: ProductoConStock,
  branchFilter: number | null,
  direccion: 'asc' | 'desc'
): number {
  const s = stockVisibleDe(p, branchFilter);
  if (s !== null) return s;
  return direccion === 'asc' ? Infinity : -Infinity;
}
