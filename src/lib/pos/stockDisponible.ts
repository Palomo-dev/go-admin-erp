/**
 * Regla única de «agotado» del POS: un producto (o una variante, que es un
 * producto hijo con `parent_product_id`) que lleva control de stock
 * (`products.track_stock`) y no tiene unidades en la sucursal que vende
 * (o en todas, con «Todas las sucursales») no se puede agregar al carrito.
 *
 * La usan la grilla del catálogo (`POSService.getProductsPaginated` y su
 * equivalente sin conexión) y el selector de variantes (stock por variante):
 * si la regla cambia, cambia en los dos a la vez.
 */
export function agotadoPorStock(trackStock: boolean | null | undefined, cantidadEnMano: number): boolean {
  return trackStock === true && cantidadEnMano <= 0;
}
