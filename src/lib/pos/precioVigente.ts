/**
 * Precio vigente de un producto: la ÚNICA regla de vigencia de `product_prices`
 * en el POS (catálogo en línea, variantes, carrito y catálogo local del
 * escritorio). La misma regla la aplica `pos_checkout_v1` en el servidor
 * (`fn_pos_precios_candidatos`):
 *
 *   effective_from <= ahora < coalesce(effective_to, infinito)
 *
 * y, entre las filas vigentes, la de `effective_from` más reciente.
 *
 * Antes (2026-09-24) había tres criterios distintos: el catálogo tomaba la
 * fila de `effective_from` más reciente SIN mirar `effective_to` (un precio
 * vencido o uno programado a futuro podía salir en el POS), el carrito pedía
 * `effective_to IS NULL` (ignoraba un precio vigente con fecha de cierre) y
 * `getProductById` filtraba con `.eq('effective_to', null)`, que en PostgREST
 * es `= null` y nunca coincide.
 */

export interface FilaPrecio {
  price: number | string | null;
  effective_from: string | null;
  effective_to?: string | null;
}

function instante(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : null;
}

/** true si la fila rige en `ahora` (desde incluido, hasta excluido). */
export function esPrecioVigente(fila: FilaPrecio, ahora: Date = new Date()): boolean {
  const t = ahora.getTime();
  const desde = instante(fila.effective_from);
  if (desde === null || desde > t) return false;
  const hasta = instante(fila.effective_to ?? null);
  return hasta === null || t < hasta;
}

/** La fila vigente con `effective_from` más reciente, o null si no hay ninguna. */
export function precioVigente<T extends FilaPrecio>(filas: readonly T[] | null | undefined, ahora: Date = new Date()): T | null {
  let elegida: T | null = null;
  let elegidaDesde = -Infinity;
  for (const fila of filas ?? []) {
    if (!esPrecioVigente(fila, ahora)) continue;
    const desde = instante(fila.effective_from) as number;
    if (desde > elegidaDesde) {
      elegida = fila;
      elegidaDesde = desde;
    }
  }
  return elegida;
}

/** Importe numérico de la fila vigente, o null si no hay precio vigente. */
export function importePrecioVigente(filas: readonly FilaPrecio[] | null | undefined, ahora: Date = new Date()): number | null {
  const fila = precioVigente(filas, ahora);
  if (!fila) return null;
  const n = typeof fila.price === 'string' ? parseFloat(fila.price) : fila.price;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Error que no deja entrar un producto sin precio vigente (antes entraba gratis). */
export class ProductoSinPrecioError extends Error {
  readonly productId: number;
  readonly causa: 'sin_precio' | 'consulta_fallida';
  constructor(productId: number, causa: 'sin_precio' | 'consulta_fallida', nombre?: string | null) {
    const quien = nombre ? `«${nombre}»` : `el producto ${productId}`;
    super(
      causa === 'sin_precio'
        ? `No se agregó ${quien}: no tiene un precio vigente. Configure su precio en Inventario.`
        : `No se agregó ${quien}: no se pudo consultar su precio. Revise la conexión e intente de nuevo.`,
    );
    this.name = 'ProductoSinPrecioError';
    this.productId = productId;
    this.causa = causa;
  }
}
