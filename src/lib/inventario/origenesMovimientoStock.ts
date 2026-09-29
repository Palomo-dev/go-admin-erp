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
  // Compras F1 (20260926130000): la anulación de una factura de compra revierte
  // su kardex con este origen; el CHECK lo rechazaba y anular fallaba siempre.
  'purchase_void',
  // Notas crédito (20260928144544): anular una nota saca por kardex lo que su
  // reingreso devolvió al inventario, con origen propio.
  'credit_note_void',
] as const;

export type OrigenMovimientoStock = (typeof ORIGENES_MOVIMIENTO_STOCK)[number];

/** true si el valor puede escribirse en `stock_movements.source` sin que el CHECK lo rechace. */
export function esOrigenMovimientoValido(valor: string): valor is OrigenMovimientoStock {
  return (ORIGENES_MOVIMIENTO_STOCK as readonly string[]).includes(valor);
}

// ─── Presentación: el ÚNICO mapa de orígenes (bloque B0) ─────────────────────
//
// Antes cada pantalla tenía el suyo (`KardexTable.tsx`, `MovimientosTable.tsx`,
// `stockService.ts`) con orígenes que la BD no acepta (`waste`,
// `recipe_consumption`) y sin 15 de los 24 reales. Desde B0 la etiqueta, el
// tono y el tipo de documento salen de aquí; `kit/inventario/BadgeOrigenMovimiento`
// los pinta (Figma 530:65022). La etiqueta es la clave
// `inventario.origenes.<origen>` en messages/*.json.

/** Mismos tonos que `kit/estadoTono` (`TonoBadge`), sin depender de la capa de componentes. */
export type TonoOrigen = 'marca' | 'exito' | 'advertencia' | 'peligro' | 'informacion' | 'neutro';

export type TipoDocumentoOrigen =
  | 'venta'
  | 'factura_venta'
  | 'nota_credito'
  | 'devolucion'
  | 'factura_compra'
  | 'orden_compra'
  | 'ajuste'
  | 'traslado'
  | 'orden_produccion'
  | 'folio'
  | 'pedido_web'
  | 'producto';

export interface MetaOrigen {
  /** Tono del badge (Figma 530:65022). */
  tono: TonoOrigen;
  /** Dirección con que escribe hoy el código (`ambas` si depende del caso: ajuste, devolución). */
  direccion: 'in' | 'out' | 'ambas';
  /** Documento que explica el movimiento (lo resuelve `fn_inv_documentos`). */
  documento: TipoDocumentoOrigen;
}

export const META_ORIGEN: Record<OrigenMovimientoStock, MetaOrigen> = {
  purchase: { tono: 'marca', direccion: 'in', documento: 'factura_compra' },
  sale: { tono: 'peligro', direccion: 'out', documento: 'venta' },
  adjustment: { tono: 'advertencia', direccion: 'ambas', documento: 'ajuste' },
  transfer: { tono: 'informacion', direccion: 'ambas', documento: 'traslado' },
  return: { tono: 'exito', direccion: 'in', documento: 'devolucion' },
  loss: { tono: 'peligro', direccion: 'out', documento: 'producto' },
  production: { tono: 'marca', direccion: 'ambas', documento: 'orden_produccion' },
  initial: { tono: 'neutro', direccion: 'in', documento: 'producto' },
  web_sale: { tono: 'peligro', direccion: 'out', documento: 'venta' },
  mesa_sale: { tono: 'peligro', direccion: 'out', documento: 'venta' },
  invoice_sale: { tono: 'peligro', direccion: 'out', documento: 'factura_venta' },
  folio_item: { tono: 'advertencia', direccion: 'out', documento: 'folio' },
  room_consumption: { tono: 'advertencia', direccion: 'out', documento: 'folio' },
  web_order: { tono: 'informacion', direccion: 'out', documento: 'pedido_web' },
  purchase_order: { tono: 'marca', direccion: 'in', documento: 'orden_compra' },
  purchase_invoice: { tono: 'marca', direccion: 'in', documento: 'factura_compra' },
  invoice_void: { tono: 'exito', direccion: 'in', documento: 'factura_venta' },
  credit_note: { tono: 'exito', direccion: 'in', documento: 'nota_credito' },
  web_refund: { tono: 'exito', direccion: 'in', documento: 'pedido_web' },
  folio_item_reversal: { tono: 'advertencia', direccion: 'in', documento: 'folio' },
  transfer_out: { tono: 'informacion', direccion: 'out', documento: 'traslado' },
  transfer_in: { tono: 'informacion', direccion: 'in', documento: 'traslado' },
  purchase_void: { tono: 'peligro', direccion: 'out', documento: 'factura_compra' },
  credit_note_void: { tono: 'peligro', direccion: 'out', documento: 'nota_credito' },
};

/** Metadatos de un origen; `null` si no es un origen admitido (datos viejos o valor ajeno). */
export function metaOrigen(valor: string | null | undefined): MetaOrigen | null {
  return valor && esOrigenMovimientoValido(valor) ? META_ORIGEN[valor] : null;
}

/** Orígenes de venta: los que pueden dejar existencia negativa salvo `bloquear_venta_sin_stock` (P5). */
export const ORIGENES_VENTA: readonly OrigenMovimientoStock[] = [
  'sale',
  'web_sale',
  'mesa_sale',
  'invoice_sale',
  'folio_item',
  'room_consumption',
  'web_order',
];
