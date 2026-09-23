/**
 * Orígenes admitidos de un movimiento de kardex (`stock_movements.source`).
 *
 * Esta lista es el espejo en TypeScript del CHECK `stock_movements_source_check`
 * (`supabase/migrations/20260923100000_stock_movements_admite_los_origenes_que_el_codigo_escribe.sql`).
 * Las dos tienen que decir lo mismo, y el guardarraíl 23 de
 * `src/__tests__/guardrails.test.ts` lo comprueba.
 *
 * Por qué existe: durante catorce meses el código escribió ocho orígenes que el
 * CHECK rechazaba. Seis fallaban **en silencio** —el error se guardaba en un
 * array y moría en un `console.warn`, así que las existencias cambiaban y el
 * kardex no se enteraba— y dos reventaban el traslado entero. Ninguna recepción
 * de orden de compra y ningún traslado llegó al kardex en ese tiempo.
 *
 * Si hace falta un origen nuevo: se añade aquí Y en una migración que amplíe el
 * CHECK, en el mismo commit. Añadirlo solo en el código vuelve a romperlo en
 * silencio.
 */
export const ORIGENES_MOVIMIENTO_STOCK = [
  // Los catorce originales
  'purchase',
  'sale',
  'adjustment',
  'transfer',
  'return',
  'loss',
  'production',
  'initial',
  'web_sale',
  'mesa_sale',
  'invoice_sale',
  'folio_item',
  'room_consumption',
  'web_order',
  // Los ocho que el código ya escribía y el CHECK rechazaba
  'purchase_order',
  'purchase_invoice',
  'invoice_void',
  'credit_note',
  'web_refund',
  'folio_item_reversal',
  'transfer_out',
  'transfer_in',
] as const;

export type OrigenMovimientoStock = (typeof ORIGENES_MOVIMIENTO_STOCK)[number];

/** true si el valor puede escribirse en `stock_movements.source` sin que el CHECK lo rechace. */
export function esOrigenMovimientoValido(valor: string): valor is OrigenMovimientoStock {
  return (ORIGENES_MOVIMIENTO_STOCK as readonly string[]).includes(valor);
}
