/**
 * Confirmación del pedido web en UNA transacción (paquete E · E2/E3).
 *
 * Contrato con las RPC de `supabase/pendientes/`:
 * - `fn_confirmar_pedido_web_completo`: venta, líneas, stock, comanda (source
 *   'web', `kitchen_tickets.web_order_id`) y estado. Idempotente: reintentar
 *   completa lo que falte (el pedido huérfano «venta sin líneas» se repara).
 * - `pos_mesa_agregar_pedido_web`: un «Comer aquí» sin pagar en línea entra a
 *   la cuenta de su mesa en POS › Mesas, con su comanda.
 *
 * Interruptor de despliegue: solo con
 * `NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA=true`. Sin él, o si la base
 * todavía no tiene la función (PGRST202/42883), quien llama sigue con el
 * camino de siempre: estas funciones devuelven `null` y no lanzan.
 *
 * Las líneas se calculan aquí (`lineasVentaPedidoWeb`, webOrderTotals.ts) y la
 * base solo las inserta: el prorrateo de descuentos tiene una sola
 * implementación.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder } from './webOrdersService';
import { lineasVentaPedidoWeb, type RepartoPedidoWeb } from './webOrderTotals';

type ClienteRpc = Pick<SupabaseClient, 'rpc'>;

export function confirmacionCompletaActiva(): boolean {
  return process.env.NEXT_PUBLIC_WEB_ORDERS_CONFIRMACION_COMPLETA === 'true';
}

/** La base aún no tiene la función (migración pendiente): se degrada al camino actual. */
export function esFuncionAusente(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; message?: string };
  return e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? '');
}

export interface ResultadoConfirmacionCompleta {
  sale_id: string | null;
  venta_creada: boolean;
  items_creados: number;
  kitchen_ticket_id: number | null;
  comanda_creada: boolean;
  estado_actualizado: boolean;
  /** No había nada que hacer: el pedido ya estaba confirmado completo. */
  ya_completo: boolean;
  table_session_id?: string | null;
  stock?: { errores?: string[]; descontados?: number; liberados?: number; seriales?: number } | null;
}

/** Errores por línea del descuento de stock (receta/insumos) que la RPC no hace fallar. */
export function erroresDeStock(stock: ResultadoConfirmacionCompleta['stock']): string[] {
  const errores = stock?.errores;
  return Array.isArray(errores) ? errores.map(String) : [];
}

export interface OpcionesConfirmacionCompleta {
  prepMin: number | null;
  transitMin?: number | null;
  pagado: boolean;
  customerId?: string | null;
  userId?: string | null;
  /** false con pago en línea: quien llama crea la factura y luego marca el estado. */
  marcarConfirmado: boolean;
  reparto?: RepartoPedidoWeb;
}

/**
 * Llama a `fn_confirmar_pedido_web_completo`. `null` = función ausente
 * (degradar). Cualquier otro error se lanza.
 */
export async function confirmarPedidoWebCompleto(
  client: ClienteRpc,
  order: WebOrder,
  opciones: OpcionesConfirmacionCompleta,
): Promise<ResultadoConfirmacionCompleta | null> {
  const { data, error } = await client.rpc('fn_confirmar_pedido_web_completo', {
    p_order_id: order.id,
    p_lineas: lineasVentaPedidoWeb(order, opciones.reparto),
    p_prep_min: opciones.prepMin,
    p_transit_min: opciones.transitMin ?? null,
    p_pagado: opciones.pagado,
    p_customer_id: opciones.customerId ?? null,
    p_user_id: opciones.userId ?? null,
    p_marcar_confirmado: opciones.marcarConfirmado,
  });
  if (error) {
    if (esFuncionAusente(error)) return null;
    throw new Error(error.message || 'No se pudo confirmar el pedido');
  }
  return normalizar(data);
}

/** El pedido «Comer aquí» se agrega a la cuenta de su mesa (no lo pagado en línea). */
export function vaALaCuentaDeLaMesa(
  order: Pick<WebOrder, 'delivery_type' | 'payment_status'> & { restaurant_table_id?: string | null },
): boolean {
  return order.delivery_type === 'dine_in' && !!order.restaurant_table_id && order.payment_status !== 'paid';
}

/**
 * Llama a `pos_mesa_agregar_pedido_web`. `null` = función ausente (degradar a
 * `confirmarPedidoWebCompleto`, venta propia). Otros errores se lanzan.
 */
export async function agregarPedidoALaMesa(
  client: ClienteRpc,
  order: WebOrder,
  opciones: { prepMin: number | null; userId?: string | null; reparto?: RepartoPedidoWeb },
): Promise<ResultadoConfirmacionCompleta | null> {
  const { data, error } = await client.rpc('pos_mesa_agregar_pedido_web', {
    p_order_id: order.id,
    p_lineas: lineasVentaPedidoWeb(order, opciones.reparto),
    p_prep_min: opciones.prepMin,
    p_user_id: opciones.userId ?? null,
  });
  if (error) {
    if (esFuncionAusente(error)) return null;
    throw new Error(error.message || 'No se pudo agregar el pedido a la mesa');
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    sale_id: (r.sale_id as string) ?? null,
    venta_creada: false,
    items_creados: Number(r.items_agregados ?? 0),
    kitchen_ticket_id: (r.kitchen_ticket_id as number) ?? null,
    comanda_creada: r.kitchen_ticket_id != null,
    estado_actualizado: r.ya_completo !== true,
    ya_completo: r.ya_completo === true,
    table_session_id: (r.table_session_id as string) ?? null,
    stock: null,
  };
}

function normalizar(data: unknown): ResultadoConfirmacionCompleta {
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    sale_id: (r.sale_id as string) ?? null,
    venta_creada: r.venta_creada === true,
    items_creados: Number(r.items_creados ?? 0),
    kitchen_ticket_id: (r.kitchen_ticket_id as number) ?? null,
    comanda_creada: r.comanda_creada === true,
    estado_actualizado: r.estado_actualizado === true,
    ya_completo: r.ya_completo === true,
    table_session_id: (r.table_session_id as string) ?? null,
    stock: (r.stock as ResultadoConfirmacionCompleta['stock']) ?? null,
  };
}
