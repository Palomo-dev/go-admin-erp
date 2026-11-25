/**
 * «Estado del pago» del pedido online (Figma «05 POS y ventas» 3306-209101, aprobado el
 * 2026-11-25). Seis estados DEDUCIDOS de `web_orders` (sin columna nueva), con las reglas que ya
 * existen en `contraentregaPedido.ts`. Puro: lo prueba `__tests__/estadoPagoPedido.test.ts`.
 *
 * - Pagado completo: pagado (`payment_status = paid`) y NO es contraentrega (pasarela por el total).
 * - Anticipo pagado: contraentrega con anticipo (`advance_amount > 0`) y `advance_status = paid`.
 * - Por cobrar en puerta: contraentrega en la calle con algo por cobrar (`porCobrarEnPuerta`).
 * - Cobrado en puerta: contraentrega ya pagada del todo (el saldo entró al entregar).
 * - Pendiente: `payment_status = pending` (aún no paga nada).
 * - Vencido: anticipo vencido o pedido vencido por falta de pago (`status = expired`).
 *
 * Los estados se CRUZAN (lo dice la lámina): un pedido con anticipo que aún no se entrega está en
 * «Anticipo pagado» y en «Por cobrar en puerta» a la vez. Por eso se devuelve una lista.
 */
import { esPedidoContraentrega, estadoAnticipo, porCobrarEnPuerta, tieneAnticipo, type PedidoContraentrega } from './contraentregaPedido';

export type EstadoPagoPedido = 'pagadoCompleto' | 'anticipoPagado' | 'porCobrarPuerta' | 'cobradoPuerta' | 'pendiente' | 'vencido';

export const ESTADOS_PAGO_PEDIDO: readonly EstadoPagoPedido[] = [
  'pagadoCompleto',
  'anticipoPagado',
  'porCobrarPuerta',
  'cobradoPuerta',
  'pendiente',
  'vencido',
];

export function esEstadoPagoPedido(v: unknown): v is EstadoPagoPedido {
  return typeof v === 'string' && (ESTADOS_PAGO_PEDIDO as readonly string[]).includes(v);
}

export function estadosPagoDelPedido(o: PedidoContraentrega): EstadoPagoPedido[] {
  const estados: EstadoPagoPedido[] = [];
  const contraentrega = esPedidoContraentrega(o);
  const pagado = o.payment_status === 'paid';
  if (pagado && !contraentrega) estados.push('pagadoCompleto');
  if (contraentrega && tieneAnticipo(o) && estadoAnticipo(o) === 'pagado') estados.push('anticipoPagado');
  if (porCobrarEnPuerta(o) > 0) estados.push('porCobrarPuerta');
  if (contraentrega && pagado) estados.push('cobradoPuerta');
  if (o.payment_status === 'pending') estados.push('pendiente');
  if (o.advance_status === 'expired' || o.status === 'expired') estados.push('vencido');
  return estados;
}

/** ¿El pedido está en ALGUNO de los estados elegidos? Sin elegidos, todos pasan. */
export function coincideEstadoPago(o: PedidoContraentrega, elegidos: readonly EstadoPagoPedido[]): boolean {
  if (elegidos.length === 0) return true;
  const propios = estadosPagoDelPedido(o);
  return elegidos.some((e) => propios.includes(e));
}

/** Cuántos pedidos hay en cada estado (un pedido cuenta en cada estado en que esté). */
export function contarEstadosPago(pedidos: readonly PedidoContraentrega[]): Record<EstadoPagoPedido, number> {
  const c = Object.fromEntries(ESTADOS_PAGO_PEDIDO.map((e) => [e, 0])) as Record<EstadoPagoPedido, number>;
  for (const o of pedidos) for (const e of estadosPagoDelPedido(o)) c[e] += 1;
  return c;
}
