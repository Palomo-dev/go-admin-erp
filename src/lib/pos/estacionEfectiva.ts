/**
 * Estación de cocina/bar efectiva de un producto (decisión del dueño,
 * 2026-09-24): el producto usa la estación de su CATEGORÍA salvo que tenga una
 * estación PROPIA; si no tiene propia y la de la categoría cambia, la del
 * producto cambia con ella.
 *
 * `products.station` es la estación PROPIA; NULL = hereda. El orden es el de
 * `fn_estacion_efectiva` en la BD (migración 20260924191000):
 *   propia del producto → propia del padre (variantes) → la de la categoría.
 *
 * Esta función es para los datos que el POS ya tiene en memoria (también sin
 * conexión, con la réplica local). Cuando hay que consultar, usar la RPC
 * `fn_estaciones_efectivas` en lugar de leer products.station.
 */

export const ESTACIONES_COCINA = ['hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all'] as const;
export type EstacionCocina = (typeof ESTACIONES_COCINA)[number];

export function esEstacionCocina(valor: string | null | undefined): valor is EstacionCocina {
  return !!valor && (ESTACIONES_COCINA as readonly string[]).includes(valor);
}

const limpia = (valor: string | null | undefined): string | null => {
  const v = typeof valor === 'string' ? valor.trim() : '';
  return v ? v : null;
};

export interface FuentesEstacion {
  /** products.station del producto (propia; NULL = hereda). */
  propia?: string | null;
  /** products.station del padre, si el producto es una variante. */
  propiaPadre?: string | null;
  /** categories.station de la categoría del producto (o la del padre). */
  categoria?: string | null;
}

export function estacionEfectiva({ propia, propiaPadre, categoria }: FuentesEstacion): string | null {
  return limpia(propia) ?? limpia(propiaPadre) ?? limpia(categoria);
}

/** La categoría llega como objeto, como arreglo (embed de PostgREST) o nula. */
export function estacionDeCategoria(
  categoria: { station?: string | null } | Array<{ station?: string | null }> | null | undefined,
): string | null {
  if (!categoria) return null;
  const c = Array.isArray(categoria) ? categoria[0] : categoria;
  return limpia(c?.station);
}
