/**
 * Desglose del reembolso que ya muestra el historial.
 *
 * `returns.total_refund` es el total reembolsado y ya incluye el impuesto.
 * El impuesto es la suma de `return_lines.tax_amount` de esa devolución.
 * El subtotal es la diferencia. No se prorratea el impuesto de la venta:
 * eso lo volvía a sumar encima del total (21.600 pasaba a 23.328).
 */

export interface DesgloseReembolso {
  total: number;
  impuesto: number;
  subtotal: number;
}

function numero(valor: number): number {
  return Number.isFinite(valor) ? valor : 0;
}

export function desgloseReembolso(totalRefund: number, impuestoLineas: number): DesgloseReembolso {
  const total = numero(totalRefund);
  const impuesto = numero(impuestoLineas);
  return {
    total,
    impuesto,
    subtotal: total - impuesto,
  };
}
