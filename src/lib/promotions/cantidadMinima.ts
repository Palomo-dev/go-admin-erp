/**
 * Unidades mínimas de una promo de porcentaje, monto fijo o paquete.
 *
 * Solo cuenta `min_quantity`. Vacía es sin mínimo: `buy_quantity` es el 2
 * por defecto del formulario y, en Compra X Lleva Y, la X. No se deduce
 * un mínimo de ahí. El mismo criterio está en la tienda.
 */

function enteroPositivo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function cantidadMinimaEfectiva(p: {
  promotion_type?: string | null;
  min_quantity?: unknown;
  buy_quantity?: unknown;
}): number | null {
  const tipo = p.promotion_type;
  if (tipo !== 'percentage' && tipo !== 'fixed_amount' && tipo !== 'bundle') return null;
  return enteroPositivo(p.min_quantity);
}

/**
 * La copia de una promo vieja guarda el mínimo en `min_quantity`.
 * Quita `promotion_rules`: es la relación embebida, no una columna.
 */
export function copiaDePromocion<T extends {
  promotion_type?: string | null;
  min_quantity?: number | null;
  buy_quantity?: number | null;
  promotion_rules?: unknown;
}>(original: T): Omit<T, 'promotion_rules'> {
  const { promotion_rules, ...resto } = original;
  void promotion_rules;
  const tipo = resto.promotion_type;
  const conMinimo = tipo === 'percentage' || tipo === 'fixed_amount' || tipo === 'bundle';
  if (!conMinimo) return resto;
  return { ...resto, min_quantity: cantidadMinimaEfectiva(resto) };
}

/**
 * Al editar, el campo muestra `min_quantity` y no rellena el 2 de
 * `buy_quantity`. Una promo nueva tampoco hereda ese 2.
 */

export function minimoDelFormulario<T extends {
  promotion_type?: string | null;
  min_quantity?: number | null;
  buy_quantity?: number | null;
}>(datos: T, editando: boolean): T {
  if (!editando) return datos;
  const tipo = datos.promotion_type;
  if (tipo !== 'percentage' && tipo !== 'fixed_amount' && tipo !== 'bundle') return datos;
  return { ...datos, min_quantity: cantidadMinimaEfectiva(datos) };
}
