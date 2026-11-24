/**
 * Un solo estado entre Logística y Pedidos online (2026-11-24). Puro.
 *
 * La regla VIVE en la base (migración 20261124233000_sincronizar_estado_envio_pedido_web:
 * `fn_pedido_web_estado_de_envio`, `fn_pedido_web_rango` y los triggers
 * `trg_shipments_sincroniza_pedido` / `trg_web_orders_sincroniza_envio` /
 * `trg_shipments_estado_inicial_de_pedido`), porque el estado del pedido y el del envío se escriben
 * desde muchos sitios. Esto es su COPIA para leerla y probarla:
 * `__tests__/sincronizacionPedidoEnvio.test.ts` fija que las dos digan lo mismo.
 *
 * - Envío → pedido: solo AVANZA (nunca retrocede) y nunca toca un pedido sin confirmar ni uno
 *   cerrado. La novedad (intento fallido) solo se muestra; cancelar o devolver el envío no
 *   cancela el pedido.
 * - Pedido → envío: «listo» deja listo para salir el envío que aún no se movía; cancelar,
 *   rechazar, vencer o reembolsar el pedido cancela el envío que aún no salió. «En camino» y
 *   «entregado» desde Pedidos online no mueven el envío: la entrega exige prueba, código y cobro.
 * - Los avisos al cliente NO salen de la base: los manda quien hizo el cambio (`aviso` de la RPC
 *   → /api/web-orders/[id]/aviso-estado, que no repite un momento ya enviado).
 */

export type EstadoPedidoSincronizado = 'ready' | 'in_delivery' | 'delivered';

/** Estado al que el envío lleva al pedido (null = no lo mueve). = fn_pedido_web_estado_de_envio. */
export function estadoPedidoDeEnvio(estadoEnvio: string | null | undefined): EstadoPedidoSincronizado | null {
  switch (estadoEnvio) {
    case 'ready':
    case 'ready_for_pickup':
      return 'ready';
    case 'picked':
    case 'dispatched':
    case 'in_transit':
    case 'out_for_delivery':
      return 'in_delivery';
    case 'delivered':
      return 'delivered';
    default:
      return null;
  }
}

/** Orden del camino del pedido (null = la sincronización no lo mueve). = fn_pedido_web_rango. */
export function rangoPedido(estado: string | null | undefined): number | null {
  switch (estado) {
    case 'confirmed':
      return 1;
    case 'preparing':
      return 2;
    case 'ready':
      return 3;
    case 'in_delivery':
      return 4;
    case 'delivered':
      return 5;
    default:
      return null;
  }
}

/** Estado nuevo del pedido cuando su envío pasa a `estadoEnvio`; null si no cambia. */
export function pedidoTrasEnvio(estadoPedido: string | null | undefined, estadoEnvio: string | null | undefined): EstadoPedidoSincronizado | null {
  const destino = estadoPedidoDeEnvio(estadoEnvio);
  if (!destino) return null;
  const actual = rangoPedido(estadoPedido);
  const nuevo = rangoPedido(destino);
  return actual !== null && nuevo !== null && actual < nuevo ? destino : null;
}

/** Estados del pedido que cancelan su envío aún sin salir. */
export const ESTADOS_PEDIDO_QUE_CANCELAN_ENVIO = ['cancelled', 'rejected', 'expired', 'refunded'] as const;

/** Envío que todavía no salió: el que se cancela con el pedido. */
export const ESTADOS_ENVIO_SIN_SALIR = ['draft', 'pending', 'ready', 'ready_for_pickup', 'assigned'] as const;

/** Envío que aún no se movía: el que queda «listo para salir» cuando el pedido está listo. */
export const ESTADOS_ENVIO_SIN_MOVER = ['draft', 'pending'] as const;

/** Estado nuevo del envío cuando su pedido pasa a `estadoPedido`; null si no cambia. */
export function envioTrasPedido(estadoEnvio: string | null | undefined, estadoPedido: string | null | undefined): 'ready_for_pickup' | 'cancelled' | null {
  const envio = String(estadoEnvio ?? '');
  if (estadoPedido === 'ready' && (ESTADOS_ENVIO_SIN_MOVER as readonly string[]).includes(envio)) return 'ready_for_pickup';
  if ((ESTADOS_PEDIDO_QUE_CANCELAN_ENVIO as readonly string[]).includes(String(estadoPedido ?? '')) && (ESTADOS_ENVIO_SIN_SALIR as readonly string[]).includes(envio)) {
    return 'cancelled';
  }
  return null;
}
