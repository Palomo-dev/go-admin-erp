/**
 * Adquiriente de la factura de un pedido web (criterio contable del dueño, 2026-11-25).
 *
 * El adquiriente es quien paga y pide la factura. Si el comprador pidió factura con NIT y la
 * empresa quedó resuelta (`web_orders.billing_data.customer_id`, por el checkout o por la revisión
 * «Ligar»/«Usar este»), la factura y su cartera van a nombre de la EMPRESA; la persona queda como
 * contacto (sigue en el pedido y en la venta). Sin NIT, el cliente del pedido, como siempre.
 *
 * La regla vive en UNA función de la base, `fn_web_order_cliente_factura` (migración
 * 20261125170000), la misma que usan `fn_cobrar_pedido_web_en_caja`,
 * `fn_marcar_pedido_web_pagado_pasarela` y los terceros contables. Aquí solo se llama: nunca se
 * reimplementa leyendo `billing_data` en Node.
 *
 * Nunca lanza: si la RPC falla (p. ej. la función aún no existe), devuelve el respaldo (el cliente
 * del pedido, lo de antes) y deja el error en el log: un pedido pagado nunca se queda sin confirmar
 * por esto.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function clienteFacturaPedidoWebId(
  db: Pick<SupabaseClient, 'rpc'>,
  orderId: string,
  respaldo: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await db.rpc('fn_web_order_cliente_factura', { p_order_id: orderId });
    if (error) {
      console.error('[adquirientePedido] No se pudo resolver el adquiriente del pedido', { orderId, code: error.code });
      return respaldo;
    }
    return typeof data === 'string' && data.length > 0 ? data : respaldo;
  } catch (err) {
    console.error('[adquirientePedido] No se pudo resolver el adquiriente del pedido', { orderId, err });
    return respaldo;
  }
}
