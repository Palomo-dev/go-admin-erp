/**
 * Espejo TypeScript de la regla ÚNICA de costo promedio del núcleo
 * (`fn_inv_int_costo_promedio`, migración 20260929020200_inv_b0_3_primitiva.sql).
 *
 * Solo para mostrar (resúmenes de recepción, «nuevo costo promedio» en un
 * diálogo antes de confirmar). El valor que vale es el que devuelve la RPC:
 * nunca se escribe `avg_cost` desde el navegador.
 *
 *   existencia previa ≤ 0 → costo de la entrada
 *   si no                 → (existencia × promedio + cantidad × costo) ÷ (existencia + cantidad)
 *
 * `stock_levels.avg_cost` es numeric(12,2): el valor guardado se redondea a 2
 * decimales (`redondearCosto`), y la cantidad a 3 (`redondearCantidad`).
 */

export function costoPromedioTrasEntrada(
  existenciaAntes: number,
  promedioAntes: number,
  cantidad: number,
  costo: number,
): number {
  const q = Number(existenciaAntes) || 0;
  const c = Number(costo) || 0;
  if (q <= 0) return c;
  const n = Number(cantidad) || 0;
  return (q * (Number(promedioAntes) || 0) + n * c) / (q + n);
}

/** Redondeo de `numeric(12,2)` (medio hacia arriba, como Postgres). */
export function redondearCosto(valor: number): number {
  return Math.sign(valor) * Math.round(Math.abs(valor) * 100 + Number.EPSILON) / 100;
}

/** Redondeo de `numeric(12,3)`: la primitiva redondea la cantidad antes de mover. */
export function redondearCantidad(valor: number): number {
  return Math.sign(valor) * Math.round(Math.abs(valor) * 1000 + Number.EPSILON) / 1000;
}
