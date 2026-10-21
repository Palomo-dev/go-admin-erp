/**
 * Unidades mínimas de una promo de porcentaje, monto fijo o paquete.
 *
 * `min_quantity` manda. Si viene vacía, un `buy_quantity` mayor que 1 es el
 * mínimo que ya tenían las promos creadas antes de esa columna: el formulario
 * lo guardaba ahí. En Compra X Lleva Y, `buy_quantity` es la X y no es un mínimo.
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
  const explicita = enteroPositivo(p.min_quantity);
  if (explicita != null) return explicita;
  const legado = enteroPositivo(p.buy_quantity);
  return legado != null && legado > 1 ? legado : null;
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
 * Al editar, el campo «cantidad mínima» muestra el mínimo que de verdad
 * se aplica, aunque siga guardado en `buy_quantity`. Una promo nueva no
 * hereda el 2 por defecto de Compra X Lleva Y.
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
