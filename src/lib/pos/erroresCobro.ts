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
  // Punto 6: deuda, cobro de una venta existente y anulación.
  'deuda_sin_cliente',
  'deuda_con_pagos',
  'plazo_invalido',
  'venta_no_encontrada',
  'venta_anulada',
  'venta_ya_pagada',
  'cobro_de_otra_venta',
  'sin_permiso',
  'sin_acceso_sucursal',
  'motivo_requerido',
  'venta_con_devoluciones',
  'mesa_abierta',
  'caja_cerrada',
  'periodo_cerrado',
  'PROPINA_DISTRIBUIDA',
  // De fn_anular_pago (anulación única de pagos), llamada por pos_anular_venta_v1.
  'pago_en_caja_cerrada',
  'pago_no_anulable',
  // Punto 1: la mesa cobra con pos_checkout_v1.
  'sesion_mesa_invalida',
  'no_es_venta_de_mesa',
  // Cuenta dividida (20260929060000): un cobro de mesa no abona más que el saldo.
  'pago_excede_saldo',
  // Productos por peso o medida (fn_pos_validar_pesaje, 20260929120100).
  'cantidad_decimales',
  'cantidad_bajo_minimo',
  'origen_peso_invalido',
  'origen_peso_no_disponible',
  'peso_exige_bascula',
  'sin_permiso_peso_manual',
] as const;

export type CodigoErrorCobro = (typeof CODIGOS_ERROR_COBRO)[number];

/** Código estable del error de la RPC, o null si no es uno conocido. */
export function codigoErrorCobro(error: unknown): CodigoErrorCobro | null {
  if (!error || typeof error !== 'object') return null;
  const mensaje = String((error as { message?: unknown }).message ?? '').trim();
  const primera = mensaje.split(/[\s:]/)[0];
  return (CODIGOS_ERROR_COBRO as readonly string[]).includes(primera) ? (primera as CodigoErrorCobro) : null;
}

/** Traductor mínimo (el `t` de next-intl del namespace `posCobroServidor`). */
export type TraductorCobro = (clave: string, valores?: Record<string, string>) => string;

/** Mensaje traducido de un error de las RPC del cobro; `respaldo` si no trae código conocido. */
export function mensajeErrorCobro(error: unknown, t: TraductorCobro, respaldo: string): string {
  const codigo = codigoErrorCobro(error);
  if (codigo) return t(`errores.${codigo}`, { detalle: detalleErrorCobro(error) });
  const mensaje = error && typeof error === 'object' ? (error as { message?: unknown }).message : null;
  return typeof mensaje === 'string' && mensaje ? `${respaldo}: ${mensaje}` : respaldo;
}

/** Avisos que puede devolver `pos_anular_venta_v1` (la venta sí quedó anulada). */
export const AVISOS_ANULACION = ['factura_electronica_sin_nota_credito_dian', 'comision_ya_pagada'] as const;

/** «Venta anulada» + los avisos conocidos, traducidos. */
export function avisoAnulacion(avisos: string[], t: TraductorCobro): string {
  const partes = [t('ventaAnulada')];
  for (const aviso of avisos) {
    if ((AVISOS_ANULACION as readonly string[]).includes(aviso)) partes.push(t(`avisos.${aviso}`));
  }
  return partes.join(' ');
}

/** Detalle humano que acompaña al código (PostgREST lo manda en `details`). */
export function detalleErrorCobro(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const d = (error as { details?: unknown }).details;
  return typeof d === 'string' ? d : '';
}
