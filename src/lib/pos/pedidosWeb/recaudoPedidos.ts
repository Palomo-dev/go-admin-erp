/**
 * Filtros de recaudo del listado de Pedidos online (Figma «05 POS y ventas» 3300-420478):
 * «Medio de pago» y «Estado del pago» sobre los pedidos cargados, y los pagos que alimentan las
 * StatCards de recaudo. Puro: lo prueba `__tests__/recaudoPedidos.test.ts`.
 *
 * - Medio: un pedido pasa si tiene ALGÚN pago aprobado del periodo por un medio elegido (un
 *   pedido con anticipo por Bold y saldo en efectivo pasa con «Bold» y con «Efectivo»).
 * - Estado del pago: `estadoPagoPedido.ts` (los estados se cruzan).
 * - Pagos de las tarjetas: los del medio elegido. Si además hay filtros del PEDIDO (estado,
 *   entrega, búsqueda, estado del pago…), solo los de los pedidos que quedan en la lista: así
 *   las tarjetas dicen lo mismo que la tabla. Cada pago cuenta una vez (sin doble conteo).
 */
import { filtrarPorMedio, mediosPorPedido, type ClaveMedio, type PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';
import { coincideEstadoPago, type EstadoPagoPedido } from './estadoPagoPedido';
import type { PedidoContraentrega } from './contraentregaPedido';

export interface FiltrosRecaudoPedidos {
  medios: readonly ClaveMedio[];
  estadosPago: readonly EstadoPagoPedido[];
}

/** Solo los pagos de pedidos web (las ventas del POS no son de este listado). */
export function pagosDePedidos(pagos: readonly PagoRecaudo[]): PagoRecaudo[] {
  return pagos.filter((p) => !!p.pedidoId);
}

export function filtrarPedidosPorRecaudo<T extends PedidoContraentrega & { id: string }>(
  pedidos: readonly T[],
  pagos: readonly PagoRecaudo[],
  f: FiltrosRecaudoPedidos,
): T[] {
  const medios = f.medios.length > 0 ? mediosPorPedido(pagos) : null;
  const elegidos = new Set(f.medios);
  return pedidos.filter((o) => {
    if (medios) {
      const propios = medios.get(o.id);
      if (!propios || ![...propios].some((m) => elegidos.has(m))) return false;
    }
    return coincideEstadoPago(o, f.estadosPago);
  });
}

/**
 * Pagos para las StatCards de recaudo. `idsVisibles` = pedidos que quedaron en la lista cuando
 * hay filtros del pedido; `null` si no los hay (entonces cuentan todos los pagos del periodo,
 * también los de pedidos creados antes y cobrados hoy).
 */
export function pagosDeLasTarjetas(
  pagos: readonly PagoRecaudo[],
  medios: readonly ClaveMedio[],
  idsVisibles: ReadonlySet<string> | null,
): PagoRecaudo[] {
  const delMedio = filtrarPorMedio(pagosDePedidos(pagos), medios);
  return idsVisibles ? delMedio.filter((p) => idsVisibles.has(p.pedidoId as string)) : delMedio;
}
