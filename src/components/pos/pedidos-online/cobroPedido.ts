import { marcaPagadoPorPasarela, pedidoEsDePasarela } from '@/lib/pos/pedidosWeb/metodosCaja';
import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import type { WebOrder } from '@/lib/services/webOrdersService';

/**
 * Qué cobro ofrece el detalle de un pedido web. Una sola regla para la
 * tarjeta de acciones, la cabecera y la barra móvil.
 * - `puedeCobrar`: sin pagar, ya confirmado y no agregado a una mesa (eso se
 *   cobra al cerrar la cuenta en POS › Mesas).
 * - `cobraYEntrega`: además está listo para entregar (recoger / «Comer aquí»
 *   listo, o un domicilio en camino): «Cobrar y entregar» es la primaria.
 * - `marcarPagadoPasarela`: pedido de PASARELA (Wompi/nequi/daviplata/card,
 *   Bold, Mercado Pago, Stripe, PayPal, PayU…, también vencido o cancelado
 *   por pago fallido) sin pagar: NUNCA «Cobrar» en caja; en su lugar
 *   «Marcar como pagado» de un clic (fn_marcar_pedido_web_pagado_pasarela).
 */
export function cobroDelPedido(
  order: Pick<WebOrder, 'status' | 'payment_status' | 'delivery_type' | 'table_session_id'> & {
    payment_method?: string | null;
    payment_reference?: string | null;
    sale_id?: string | null;
  },
) {
  const isPending = order.status === 'pending';
  const isReady = order.status === 'ready';
  const isInDelivery = order.status === 'in_delivery';
  const isPickup = !esDomicilio(order.delivery_type);
  const seCobraEnLaMesa = !!order.table_session_id;
  const dePasarela = pedidoEsDePasarela(order);
  const puedeCobrar = order.payment_status !== 'paid' && !isPending && !seCobraEnLaMesa && !dePasarela;
  return {
    puedeCobrar,
    cobraYEntrega: puedeCobrar && ((isReady && isPickup) || isInDelivery),
    marcarPagadoPasarela: marcaPagadoPorPasarela(order),
  };
}
