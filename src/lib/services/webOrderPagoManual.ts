/**
 * Pago manual de un pedido online (spec pedidos_online_pago_manual_spec.md §a/§b).
 *
 * Wompi aprobó el pago, pero el webhook no llegó y la expiración dejó el pedido
 * «vencido / pago fallido» con el stock liberado. `fn_marcar_pedido_web_pagado`
 * (migración 20261025134150) lo reactiva: vuelve a reservar el stock (todo o
 * nada), lo deja pending/paid con la referencia de Wompi, registra el pago y la
 * auditoría (usuario, referencia, motivo). No exige caja: es un pago en línea.
 * Después, quien llama confirma por el camino de siempre (venta, comanda, factura).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder } from './webOrdersService';

type ClienteRpc = Pick<SupabaseClient, 'rpc'>;

/** Estados desde los que se puede marcar pagado a mano (la misma regla de la función SQL). */
export function puedeMarcarPagadoManual(
  order: Pick<WebOrder, 'status' | 'payment_status' | 'sale_id'> & { table_session_id?: string | null },
): boolean {
  if (order.payment_status === 'paid' || order.sale_id || order.table_session_id) return false;
  return order.status === 'pending'
    || order.status === 'expired'
    || (order.status === 'cancelled' && order.payment_status === 'failed');
}

export interface FaltanteStock {
  product_id: number;
  available: number;
  requested: number;
}

export type ResultadoPagoManual =
  | { ok: true; yaPagado: boolean; stockReservado: boolean; paymentId: string | null }
  | { ok: false; error: 'STOCK_INSUFICIENTE'; faltantes: FaltanteStock[] };

export type CodigoErrorPagoManual =
  | 'REFERENCIA_REQUERIDA'
  | 'MOTIVO_REQUERIDO'
  | 'PEDIDO_NO_REACTIVABLE'
  | 'PEDIDO_CON_VENTA'
  | 'SIN_PERMISO'
  | 'FUNCION_AUSENTE'
  | 'OTRO';

export class PagoManualError extends Error {
  constructor(public codigo: CodigoErrorPagoManual, mensaje?: string) {
    super(mensaje || codigo);
    this.name = 'PagoManualError';
  }
}

export function codigoDeError(error: { code?: string; message?: string } | null | undefined): CodigoErrorPagoManual {
  const m = error?.message ?? '';
  if (error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(m)) return 'FUNCION_AUSENTE';
  for (const c of ['REFERENCIA_REQUERIDA', 'MOTIVO_REQUERIDO', 'PEDIDO_NO_REACTIVABLE', 'PEDIDO_CON_VENTA'] as const) {
    if (m.includes(c)) return c;
  }
  if (m.includes('sin_permiso') || m.includes('sin_acceso_sucursal')) return 'SIN_PERMISO';
  return 'OTRO';
}

export async function marcarPedidoWebPagado(
  client: ClienteRpc,
  orderId: string,
  datos: { referencia: string; motivo: string; metodo?: string | null },
): Promise<ResultadoPagoManual> {
  const referencia = datos.referencia.trim();
  const motivo = datos.motivo.trim();
  if (referencia.length < 3) throw new PagoManualError('REFERENCIA_REQUERIDA');
  if (motivo.length < 3) throw new PagoManualError('MOTIVO_REQUERIDO');
  const { data, error } = await client.rpc('fn_marcar_pedido_web_pagado', {
    p_order_id: orderId,
    p_referencia: referencia,
    p_metodo: datos.metodo?.trim() || 'wompi',
    p_motivo: motivo,
  });
  if (error) throw new PagoManualError(codigoDeError(error), error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) {
    return {
      ok: false,
      error: 'STOCK_INSUFICIENTE',
      faltantes: Array.isArray(r.shortages) ? (r.shortages as FaltanteStock[]) : [],
    };
  }
  return {
    ok: true,
    yaPagado: r.ya_pagado === true,
    stockReservado: r.stock_reservado === true,
    paymentId: (r.payment_id as string) ?? null,
  };
}
