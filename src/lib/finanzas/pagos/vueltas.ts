/**
 * Valor de un pago y sus vueltas (20261126010000_pagos_vueltas_solo_lo_cobrado).
 *
 * Regla única: lo aplicado al documento es `amount - change_amount`, para filas viejas y nuevas.
 * - Pagos del POS anteriores a 2026-11-26: `amount` = lo que el cliente entregó y `change_amount`
 *   = las vueltas.
 * - Desde esa migración la base guarda en `amount` solo lo cobrado, `change_amount` = 0 y deja lo
 *   entregado y las vueltas como dato informativo en `cash_received` y `change_given` (no se
 *   contabilizan: las vueltas entran y salen de la misma caja).
 */

export interface PagoConVueltas {
  amount?: number | string | null;
  change_amount?: number | string | null;
  cash_received?: number | string | null;
  change_given?: number | string | null;
}

function num(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lo aplicado al documento (lo cobrado). */
export function valorAplicadoPago(p: PagoConVueltas): number {
  return centavos(num(p.amount) - num(p.change_amount));
}

/** Vueltas devueltas al cliente (informativo). */
export function vueltasPago(p: PagoConVueltas): number {
  const nuevas = num(p.change_given);
  return centavos(nuevas > 0 ? nuevas : num(p.change_amount));
}

/** Efectivo que entregó el cliente (informativo): lo cobrado más las vueltas si no se guardó. */
export function recibidoPago(p: PagoConVueltas): number {
  const recibido = num(p.cash_received);
  return recibido > 0 ? centavos(recibido) : centavos(valorAplicadoPago(p) + vueltasPago(p));
}
