/**
 * Precio, costo y margen del producto. Una sola fórmula para el detalle, el
 * formulario y los KPI: margen = (precio − costo) / precio, en % sobre el
 * precio de venta (la misma que usa el catálogo en la columna «Margen»).
 */

/** Margen en % sobre el precio; `null` si no hay precio o costo. */
export function calcularMargen(precio: number | null | undefined, costo: number | null | undefined): number | null {
  if (precio === null || precio === undefined || costo === null || costo === undefined) return null;
  if (!(precio > 0)) return null;
  return redondear(((precio - costo) / precio) * 100, 1);
}

/** Costo que produce un margen dado (el formulario deja editar el margen). */
export function costoDesdeMargen(precio: number | null | undefined, margen: number | null | undefined): number | null {
  if (precio === null || precio === undefined || margen === null || margen === undefined) return null;
  if (!(precio > 0) || margen >= 100) return null;
  return redondear(precio * (1 - margen / 100), 2);
}

/** Descuento que muestra el precio de comparación («-17 %»); `null` si no aplica. */
export function descuentoComparacion(precio: number | null | undefined, comparacion: number | null | undefined): number | null {
  if (!precio || !comparacion || comparacion <= precio) return null;
  return Math.round(((comparacion - precio) / comparacion) * 100);
}

export type TonoMargen = 'exito' | 'advertencia' | 'peligro' | 'neutro';

/** Verde ≥ 30 %, ámbar ≥ 10 %, rojo por debajo (misma regla del catálogo). */
export function tonoMargen(margen: number | null): TonoMargen {
  if (margen === null) return 'neutro';
  if (margen >= 30) return 'exito';
  if (margen >= 10) return 'advertencia';
  return 'peligro';
}

/** Variación porcentual entre dos precios del historial («+5,2 %»). */
export function variacionPorcentual(anterior: number | null | undefined, actual: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || actual === null || actual === undefined) return null;
  if (anterior === 0) return null;
  return redondear(((actual - anterior) / anterior) * 100, 2);
}

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}
