/**
 * Devolución del POS: lo que el navegador manda a `procesar_devolucion` y cómo
 * se leen sus errores. Módulo hoja, sin dependencias, para probarlo sin
 * Supabase.
 *
 * La RPC hace todo en una transacción (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md
 * §5 D-1): devolución y líneas con su motivo (`reason_id`), stock por kardex
 * (seriales incluidos), salida de la caja abierta que corresponde al modo de
 * la organización —o bloqueo si no hay caja—, saldo a favor y nota crédito
 * contable. Los montos los calcula el servidor con lo cobrado en la venta: lo
 * que calcula la pantalla solo se muestra.
 *
 * La nota crédito ELECTRÓNICA (Factus/DIAN) no se envía todavía: la RPC
 * devuelve `nc_electronica: 'no_enviada'` y el id de la nota crédito contable
 * (`credit_note_invoice_id`) para encolarla desde el servidor cuando el dueño
 * decida anular vs. devolver.
 */

export type MetodoReintegroPantalla = 'cash' | 'credit_note' | 'original_method';

export interface LineaDevolucionPantalla {
  sale_item_id: string;
  return_quantity: number;
  /** Código del motivo del catálogo (`return_reasons.code`). */
  reason: string;
  serial_number_ids?: number[];
  /**
   * Producto por peso: la cantidad devuelta vuelve al inventario solo si se
   * marca «Reingresa» (por defecto no: producto fresco). Por unidad o por
   * medida lo decide el motivo, como siempre.
   */
  restock?: boolean;
}

export interface ParametrosProcesarDevolucion {
  p_organization_id: number;
  p_sale_id: string;
  p_items: Array<{ sale_item_id: string; quantity: number; reason_code: string; serial_ids: number[]; restock?: boolean }>;
  p_refund_method: 'cash' | 'store_credit';
  p_reason: string;
  p_notes: string | null;
  p_idempotency_key: string;
}

export interface ResultadoProcesarDevolucion {
  return_id: number;
  repetida: boolean;
  total_refund: number;
  refund_method: 'cash' | 'store_credit';
  cash_movement_id: number | null;
  cash_session_id: number | null;
  credit_note_invoice_id: string | null;
  credit_note_number?: string | null;
  customer_credit_id: string | null;
  nc_electronica: 'no_enviada';
}

/**
 * Método de la pantalla → método de la RPC. «Nota crédito» de la pantalla es
 * saldo a favor del cliente; «medio original» aún no existe y, como antes, se
 * reintegra en efectivo.
 */
/**
 * Lo que se reembolsa de una línea: el total cobrado (ya con descuento e
 * impuesto) prorrateado por la cantidad devuelta. Es la misma cuenta que
 * `procesar_devolucion` (`round(total / cantidad * devuelta, 2)`). El precio
 * de lista (`unit_price`) no sirve: ignora el descuento.
 */
export function montoReembolsoLinea(
  totalCobrado: number,
  cantidadVendida: number,
  cantidadDevuelta: number,
): number {
  if (!(cantidadVendida > 0) || !(cantidadDevuelta > 0) || !Number.isFinite(totalCobrado)) return 0;
  return Math.round((totalCobrado / cantidadVendida) * cantidadDevuelta * 100) / 100;
}

export function metodoReintegro(metodo: MetodoReintegroPantalla): 'cash' | 'store_credit' {
  return metodo === 'credit_note' ? 'store_credit' : 'cash';
}

export function parametrosProcesarDevolucion(
  organizationId: number,
  saleId: string,
  datos: {
    items: LineaDevolucionPantalla[];
    refund_method: MetodoReintegroPantalla;
    reason: string;
    notes?: string;
  },
  idempotencyKey: string,
): ParametrosProcesarDevolucion {
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error('Organización inválida');
  if (!saleId) throw new Error('Venta inválida');
  if (!idempotencyKey) throw new Error('Falta la clave de idempotencia');
  const items = datos.items
    .filter((item) => item.return_quantity > 0)
    .map((item) => ({
      sale_item_id: item.sale_item_id,
      quantity: item.return_quantity,
      reason_code: item.reason.trim(),
      serial_ids: item.serial_number_ids ?? [],
      ...(item.restock !== undefined ? { restock: item.restock } : {}),
    }));
  if (items.length === 0) throw new Error('Sin líneas para devolver');
  return {
    p_organization_id: organizationId,
    p_sale_id: saleId,
    p_items: items,
    p_refund_method: metodoReintegro(datos.refund_method),
    p_reason: datos.reason.trim(),
    p_notes: datos.notes?.trim() ? datos.notes.trim() : null,
    p_idempotency_key: idempotencyKey,
  };
}

/** Códigos que la RPC lanza como mensaje y que la pantalla traduce. */
export const CODIGOS_ERROR_DEVOLUCION = [
  'efectivo_sin_caja',
  'saldo_a_favor_sin_cliente',
  'venta_no_pagada',
  'cantidad_excede_disponible',
  'motivo_invalido',
  'motivo_obligatorio',
  'seriales_no_coinciden',
  'serial_invalido',
  'linea_no_pertenece_a_la_venta',
  'sin_acceso_sucursal',
  // Producto por peso o medida con más decimales de los suyos (20260929120300).
  'cantidad_decimales',
] as const;

export type CodigoErrorDevolucion = (typeof CODIGOS_ERROR_DEVOLUCION)[number] | 'generico';

/** Código estable del error de la RPC (o `generico`). */
export function codigoErrorDevolucion(error: unknown): CodigoErrorDevolucion {
  const mensaje = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  const codigo = CODIGOS_ERROR_DEVOLUCION.find((c) => mensaje.trim() === c);
  if (codigo) return codigo;
  if (/Acceso denegado/i.test(mensaje)) return 'sin_acceso_sucursal';
  return 'generico';
}

/** Clave de traducción `posDevoluciones.errores.<clave>` (camelCase). */
export function claveErrorDevolucion(codigo: CodigoErrorDevolucion): string {
  return codigo.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
}
