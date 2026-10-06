import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import type { WebOrder } from '@/lib/services/webOrdersService';

/**
 * Qué cobro ofrece el detalle de un pedido web. Una sola regla para la
 * tarjeta de acciones, la cabecera y la barra móvil.
 * - `puedeCobrar`: sin pagar, ya confirmado y no agregado a una mesa (eso se
 *   cobra al cerrar la cuenta en POS › Mesas).
 * - `cobraYEntrega`: además está listo para entregar (recoger / «Comer aquí»
 *   listo, o un domicilio en camino): «Cobrar y entregar» es la primaria.
 */
export function cobroDelPedido(order: Pick<WebOrder, 'status' | 'payment_status' | 'delivery_type' | 'table_session_id'>) {
  const isPending = order.status === 'pending';
  const isReady = order.status === 'ready';
  const isInDelivery = order.status === 'in_delivery';
  const isPickup = !esDomicilio(order.delivery_type);
  const seCobraEnLaMesa = !!order.table_session_id;
  const puedeCobrar = order.payment_status !== 'paid' && !isPending && !seCobraEnLaMesa;
  return { puedeCobrar, cobraYEntrega: puedeCobrar && ((isReady && isPickup) || isInDelivery) };
}
