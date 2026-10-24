/**
 * Diferencia entre la existencia de la sucursal y los seriales que se pueden
 * elegir (in_stock). No inventa números: solo explica el hueco.
 */
export function diferenciaSeriales(
  stock: number | null,
  disponibles: number,
): { stock: number; disponibles: number; sinSerial: number } | null {
  if (stock === null || !Number.isFinite(stock)) return null;
  const sinSerial = stock - disponibles;
  if (!(sinSerial > 0)) return null;
  return { stock, disponibles, sinSerial };
}
