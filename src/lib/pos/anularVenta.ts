/**
 * Anular una venta del POS (o una deuda): UNA llamada a `pos_anular_venta_v1`.
 *
 * La RPC resuelve todo en el servidor y en una transacción: permiso `pos.void`
 * (fn_tiene_permiso, nunca por nombre de rol), motivo obligatorio, pagos
 * anulados solo si su caja sigue abierta (si no, hay que hacer devolución) con
 * su reverso contable, propinas, comisiones, stock por kardex, seriales, nota
 * crédito por lo facturado y factura anulada; la cartera la ajustan los
 * disparadores. Es idempotente: anular dos veces devuelve `ya_anulada`.
 *
 * La nota crédito ELECTRÓNICA no se envía a Factus todavía: si la factura ya
 * salió a la DIAN, el resultado trae el aviso
 * `factura_electronica_sin_nota_credito_dian` (docs/design/POS-COBRO-SERVIDOR.md §6).
 */

import { supabase } from '@/lib/supabase/config';

export interface ResultadoAnulacion {
  sale_id: string;
  ya_anulada: boolean;
  nota_credito_id: string | null;
  nota_credito_numero: string | null;
  pagos_anulados: number;
  asientos_revertidos: number;
  propinas_anuladas: number;
  comisiones_canceladas: number;
  productos_devueltos: number;
  seriales_devueltos: number;
  avisos: string[];
}

/** Error de la RPC con su código estable (`message`) y el detalle de PostgREST. */
export class AnulacionError extends Error {
  readonly details?: string;
  readonly hint?: string;
  readonly code?: string;
  constructor(error: { message?: string; details?: string; hint?: string; code?: string }) {
    super(error.message || 'No se pudo anular la venta');
    this.name = 'AnulacionError';
    this.details = error.details;
    this.hint = error.hint;
    this.code = error.code;
  }
}

export async function anularVentaEnServidor(saleId: string, motivo: string): Promise<ResultadoAnulacion> {
  const { data, error } = await supabase.rpc('pos_anular_venta_v1', { p_sale_id: saleId, p_motivo: motivo });
  if (error) {
    throw new AnulacionError(error as { message?: string; details?: string; hint?: string; code?: string });
  }
  const r = (data ?? {}) as Partial<ResultadoAnulacion>;
  return {
    sale_id: r.sale_id ?? saleId,
    ya_anulada: r.ya_anulada === true,
    nota_credito_id: r.nota_credito_id ?? null,
    nota_credito_numero: r.nota_credito_numero ?? null,
    pagos_anulados: r.pagos_anulados ?? 0,
    asientos_revertidos: r.asientos_revertidos ?? 0,
    propinas_anuladas: r.propinas_anuladas ?? 0,
    comisiones_canceladas: r.comisiones_canceladas ?? 0,
    productos_devueltos: r.productos_devueltos ?? 0,
    seriales_devueltos: r.seriales_devueltos ?? 0,
    avisos: Array.isArray(r.avisos) ? r.avisos : [],
  };
}
