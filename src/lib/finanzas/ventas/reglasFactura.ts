/**
 * Reglas de la factura de venta que la interfaz necesita ANTES de llamar al
 * servidor (qué botón se muestra, por qué está deshabilitado). Módulo hoja.
 *
 * Son la misma regla que aplican las RPC (`fn_factura_venta_anular`,
 * `fn_factura_venta_emitir`, `fn_registrar_pago`): la base decide; esto solo
 * evita ofrecer una acción que la base va a rechazar. Extraídas sin cambiar
 * resultados de `AnularFacturaDialog.tsx` (L4) y `DetalleFactura.tsx` (L3).
 */

export type EstadoDocumento = 'draft' | 'issued' | 'paid' | 'partial' | 'void' | 'voided' | string;

export interface FacturaRegla {
  status: EstadoDocumento | null | undefined;
  total: number | string | null | undefined;
  balance: number | string | null | undefined;
  document_type?: string | null;
  sale_id?: string | null;
  einvoice_status?: string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const esAnulada = (status: EstadoDocumento | null | undefined): boolean =>
  status === 'void' || status === 'voided' || status === 'cancelled';

/** ¿La factura ya tiene pagos aplicados? (total > 0 y saldo < total). L4. */
export function tienePagosAplicados(f: Pick<FacturaRegla, 'total' | 'balance'>): boolean {
  const total = num(f.total);
  return total > 0 && num(f.balance) < total;
}

export type MotivoNoAnulable = 'ya_anulada' | 'con_pagos' | 'nota_credito' | 'fe_aceptada';

/**
 * L4. Anular está prohibido si ya está anulada, si tiene pagos (se usa nota
 * crédito) o si es una nota crédito. Con la factura electrónica aceptada por la
 * DIAN tampoco: ante la DIAN solo se anula con nota crédito.
 */
export function puedeAnular(f: FacturaRegla): { ok: true } | { ok: false; motivo: MotivoNoAnulable } {
  if (esAnulada(f.status)) return { ok: false, motivo: 'ya_anulada' };
  if (f.document_type === 'credit_note') return { ok: false, motivo: 'nota_credito' };
  if (tienePagosAplicados(f)) return { ok: false, motivo: 'con_pagos' };
  if (f.einvoice_status === 'accepted') return { ok: false, motivo: 'fe_aceptada' };
  return { ok: true };
}

/** Orígenes de kardex con los que el POS o la tienda web ya sacaron la mercancía. */
export const ORIGENES_SALIDA_VENTA = ['sale', 'mesa_sale', 'web_sale'] as const;

/**
 * L3. ¿Emitir debe descontar inventario? No si no hay líneas con producto, ni si
 * la factura viene de una venta que ya movió el kardex (POS, mesa o web).
 */
export function debeDescontarStock(
  factura: Pick<FacturaRegla, 'sale_id'>,
  movimientosPrevios: readonly { source: string | null }[],
  lineas: readonly { product_id: number | null | undefined }[],
): boolean {
  if (!lineas.some((l) => l.product_id != null)) return false;
  if (!factura.sale_id) return true;
  return !movimientosPrevios.some((m) => (ORIGENES_SALIDA_VENTA as readonly string[]).includes(m.source ?? ''));
}

export interface PermisosFinanzas {
  ver: boolean;
  crear: boolean;
  anular: boolean;
  aprobar: boolean;
}

export type AccionFactura =
  | 'registrar_pago'
  | 'emitir'
  | 'editar'
  | 'anular'
  | 'nota_credito'
  | 'duplicar'
  | 'imprimir'
  | 'enviar'
  | 'enviar_dian';

/**
 * Qué acciones ofrece el detalle y el menú de fila, según estado, saldo, FE y
 * permisos del servidor. Nunca decide por el nombre del rol.
 */
export function accionesFactura(f: FacturaRegla, permisos: PermisosFinanzas): Set<AccionFactura> {
  const acciones = new Set<AccionFactura>();
  if (!permisos.ver) return acciones;
  const anulada = esAnulada(f.status);
  const borrador = f.status === 'draft';
  const esNota = f.document_type === 'credit_note';

  acciones.add('imprimir');
  if (!anulada) acciones.add('enviar');
  if (permisos.crear && !esNota) acciones.add('duplicar');

  if (borrador) {
    if (permisos.crear) {
      acciones.add('editar');
      acciones.add('emitir');
    }
    if (permisos.anular) acciones.add('anular');
    return acciones;
  }
  if (anulada || esNota) return acciones;

  if (permisos.crear && num(f.balance) > 0) acciones.add('registrar_pago');
  if (permisos.anular && puedeAnular(f).ok) acciones.add('anular');
  if (permisos.anular) acciones.add('nota_credito');
  const fe = f.einvoice_status ?? null;
  if (permisos.crear && (fe === null || fe === 'rejected' || fe === 'failed')) acciones.add('enviar_dian');
  return acciones;
}

export type EstadoPago = 'borrador' | 'anulada' | 'pagada' | 'parcial' | 'pendiente' | 'vencida';

/**
 * Estado de pago DERIVADO (§3.4 del plan): nunca se escribe; sale de saldo,
 * total y días vencidos (calculados en la zona de la sucursal por el servidor).
 */
export function estadoPagoFactura(f: FacturaRegla & { dias_vencida?: number | null }): EstadoPago {
  if (f.status === 'draft') return 'borrador';
  if (esAnulada(f.status)) return 'anulada';
  const total = num(f.total);
  const saldo = num(f.balance);
  if (saldo <= 0) return 'pagada';
  if ((f.dias_vencida ?? 0) > 0) return 'vencida';
  if (saldo < total) return 'parcial';
  return 'pendiente';
}
