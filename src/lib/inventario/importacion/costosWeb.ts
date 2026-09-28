/**
 * Costo en créditos de IA de la importación desde la web. Lo muestra el
 * asistente ANTES de analizar y lo cobra la ruta del servidor DESPUÉS de que el
 * proveedor responda (nunca se cobra una generación fallida).
 *
 * Solo se cobra cuando interviene la IA: si la tienda expone su catálogo
 * (Shopify, WooCommerce, VTEX, Algolia) la lectura es determinista y gratis.
 * Referencia: ~1 crédito por 1 000 tokens (`defaultCreditsForUnits`); el
 * análisis de un listado con gpt-4o-mini ronda 10–15 mil tokens y el de una
 * ficha de producto, 2–3 mil.
 */
export const CREDITOS_ANALISIS_WEB = 10;
export const CREDITOS_DETALLE_WEB = 2;
/** Tope de fichas que se completan en una sola pasada. */
export const MAX_DETALLES_WEB = 100;

export function costoMaximoDetalles(cantidad: number): number {
  return Math.min(cantidad, MAX_DETALLES_WEB) * CREDITOS_DETALLE_WEB;
}
