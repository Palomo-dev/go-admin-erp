/**
 * Códigos de error estables de las RPC del cobro (`pos_checkout_v1`,
 * `pos_anular_venta_v1`). La RPC los manda como mensaje de la excepción y el
 * detalle humano en `details`; la pantalla los traduce con next-intl
 * (namespace `posCobroServidor.errores`). Un código desconocido se muestra tal
 * como llega.
 */

export const CODIGOS_ERROR_COBRO = [
  // Punto 3: precios y descuentos validados en el servidor.
  'producto_invalido',
  'descuento_excede_linea',
  'modificador_invalido',
  'precio_no_vigente',
  'precio_no_coincide',
  'linea_incoherente',
] as const;

export type CodigoErrorCobro = (typeof CODIGOS_ERROR_COBRO)[number];

/** Código estable del error de la RPC, o null si no es uno conocido. */
export function codigoErrorCobro(error: unknown): CodigoErrorCobro | null {
  if (!error || typeof error !== 'object') return null;
  const mensaje = String((error as { message?: unknown }).message ?? '').trim();
  const primera = mensaje.split(/[\s:]/)[0];
  return (CODIGOS_ERROR_COBRO as readonly string[]).includes(primera) ? (primera as CodigoErrorCobro) : null;
}

/** Detalle humano que acompaña al código (PostgREST lo manda en `details`). */
export function detalleErrorCobro(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const d = (error as { details?: unknown }).details;
  return typeof d === 'string' ? d : '';
}
