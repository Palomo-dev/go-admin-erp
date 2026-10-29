/**
 * Reembolso de un pedido web (POST /api/web-orders/[id]/refund). SOLO servidor, service_role.
 *
 * Tope (QA R2, 28-oct-2026): lo reembolsado nunca supera el total del pedido. El saldo se reserva en
 * SQL (fn_web_order_reembolso_reservar), que bloquea la fila del pedido: dos peticiones simultáneas
 * se serializan y la segunda ve lo que reservó la primera. Si el saldo queda en 0, la misma función
 * deja el pedido en refunded. Si la nota crédito falla, el saldo se devuelve (fn_web_order_reembolso_cerrar).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { crearNotaCreditoPedidoWeb } from '@/lib/services/webOrderCreditNote';

export interface ReembolsoInput {
  amount?: number | null;
  reason?: string | null;
  items?: Array<{ product_id: number; quantity: number }>;
  /** Id del reembolso en la pasarela: los reintentos con la misma referencia no duplican. */
  reference?: string | null;
}

export interface ReembolsoResultado {
  status: number;
  body: Record<string, unknown>;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/** Mensaje en español de los rechazos de la reserva. */
export function mensajeRechazoReembolso(r: { error?: string; disponible?: number; reembolsado?: number; solicitado?: number; payment_status?: string }): ReembolsoResultado {
  switch (r.error) {
    case 'EXCEDE_SALDO':
      return {
        status: 409,
        body: {
          error: `El reembolso de ${pesos(Number(r.solicitado))} supera lo que queda por reembolsar del pedido (${pesos(Number(r.disponible))}; ya se reembolsaron ${pesos(Number(r.reembolsado))}).`,
          code: 'EXCEDE_SALDO',
          disponible: Number(r.disponible),
          reembolsado: Number(r.reembolsado),
        },
      };
    case 'SIN_SALDO':
      return { status: 409, body: { error: 'El pedido ya no tiene saldo por reembolsar.', code: 'SIN_SALDO', disponible: 0 } };
    case 'PEDIDO_NO_PAGADO':
      return { status: 400, body: { error: `No se puede reembolsar un pedido con estado de pago «${r.payment_status}».`, code: 'PEDIDO_NO_PAGADO' } };
    case 'PEDIDO_NO_ENCONTRADO':
      return { status: 404, body: { error: 'Pedido no encontrado', code: 'PEDIDO_NO_ENCONTRADO' } };
    default:
      return { status: 500, body: { error: 'No se pudo registrar el reembolso.', code: r.error ?? 'ERROR' } };
  }
}

export async function reembolsarPedidoWeb(supabase: SupabaseClient, orderId: string, input: ReembolsoInput): Promise<ReembolsoResultado> {
  const reason = (input.reason || 'Reembolso solicitado por la pasarela de pago').toString();
  const partialItems = Array.isArray(input.items) ? input.items : [];
  const montoPedido = Number(input.amount) || 0;
  if (montoPedido < 0) return { status: 400, body: { error: 'El monto del reembolso no puede ser negativo.', code: 'MONTO_INVALIDO' } };

  const { data: order, error: loadError } = await supabase.from('web_orders').select('*, items:web_order_items(*)').eq('id', orderId).single();
  if (loadError || !order) return { status: 404, body: { error: 'Pedido no encontrado' } };

  if (order.payment_status === 'refunded') {
    return { status: 200, body: { success: true, message: 'El pedido ya fue reembolsado', alreadyRefunded: true } };
  }

  // 1. Reserva del saldo con bloqueo de fila.
  const { data: reserva, error: errReserva } = await supabase.rpc('fn_web_order_reembolso_reservar', {
    p_order_id: orderId,
    p_monto: montoPedido > 0 ? montoPedido : null,
    p_motivo: reason,
    p_reference: input.reference ? String(input.reference).slice(0, 120) : null,
  });
  if (errReserva) {
    // Sin la migración 20261028220000 no hay forma segura de topar parciales: se rechazan.
    console.error('[Refund] fn_web_order_reembolso_reservar:', errReserva.message);
    return { status: 503, body: { error: 'Los reembolsos no están disponibles: falta aplicar la migración de tope de reembolsos.', code: 'SIN_TOPE' } };
  }
  const r = reserva as {
    ok: boolean; error?: string; ya_registrado?: boolean; refund_id?: string; monto?: number; completo?: boolean;
    reembolsado_antes?: number; restante?: number; disponible?: number; reembolsado?: number; solicitado?: number; payment_status?: string;
  };
  if (!r.ok) {
    if (r.error === 'YA_REEMBOLSADO') return { status: 200, body: { success: true, message: 'El pedido ya fue reembolsado', alreadyRefunded: true } };
    return mensajeRechazoReembolso(r);
  }
  if (r.ya_registrado) {
    return { status: 200, body: { success: true, message: 'Reembolso ya registrado', alreadyProcessed: true, refundId: r.refund_id, refundAmount: Number(r.monto) } };
  }

  const monto = Number(r.monto);
  const completo = Boolean(r.completo);
  const primero = Number(r.reembolsado_antes ?? 0) <= 0;
  // Nota crédito total solo si es el único reembolso; si ya hubo parciales, la final es por el resto.
  const isFullRefund = completo && primero;
  const now = new Date().toISOString();

  // 2-3. Nota crédito.
  let nc: Awaited<ReturnType<typeof crearNotaCreditoPedidoWeb>>;
  try {
    nc = await crearNotaCreditoPedidoWeb(supabase, order as WebOrder, {
      isFullRefund,
      monto,
      motivo: `Nota crédito por reembolso web - Pedido ${order.order_number}. ${reason}`,
      itemsParciales: partialItems,
      now,
    });
  } catch (e) {
    await supabase.rpc('fn_web_order_reembolso_cerrar', { p_refund_id: r.refund_id, p_ok: false, p_credit_note_id: null });
    throw e;
  }

  // 4. Stock: los ítems indicados; sin ítems, todo el pedido solo en el reembolso total único
  //    (tras parciales no se sabe qué unidades ya volvieron: se indica con `items`).
  const stockErrors: string[] = [];
  const itemsToReturn = partialItems.length > 0
    ? partialItems
    : isFullRefund
      ? (order.items || []).map((item: { product_id: number; quantity: number | string | null }) => ({ product_id: item.product_id, quantity: Number(item.quantity) || 0 }))
      : [];
  for (const item of itemsToReturn) {
    if (!item.product_id || item.quantity <= 0) continue;
    const { error: movementError } = await supabase.rpc('fn_stock_entrada_al_costo', {
      p_organization_id: order.organization_id,
      p_branch_id: order.branch_id,
      p_product_id: item.product_id,
      p_qty: item.quantity,
      p_source: 'web_refund',
      p_source_id: String(order.id),
      p_note: `Devolución por reembolso - Pedido ${order.order_number}`,
      p_updated_by: null,
    });
    if (movementError) stockErrors.push(`Producto ${item.product_id}: ${movementError.message}`);
  }

  // 5. Cartera.
  const { originalInvoice } = nc;
  if (order.customer_id && originalInvoice) {
    try {
      const { data: ar } = await supabase.from('accounts_receivable').select('id, balance, amount').eq('sale_id', order.sale_id).maybeSingle();
      if (ar) {
        const newBalance = (Number(ar.balance) || 0) + monto;
        await supabase
          .from('accounts_receivable')
          .update({ balance: newBalance, status: newBalance >= (Number(ar.amount) || 0) ? 'active' : 'partial', updated_at: now })
          .eq('id', ar.id);
      }
    } catch (arError) {
      console.error('[Refund] Error ajustando AR:', arError);
    }
  }

  // 6. Factura original.
  if (originalInvoice) {
    try {
      const newBalance = (Number(originalInvoice.balance) || 0) + monto;
      const newStatus = newBalance >= (Number(originalInvoice.total) || 0) ? 'issued' : newBalance > 0 ? 'partial' : 'paid';
      await supabase.from('invoice_sales').update({ balance: newBalance, status: newStatus, updated_at: now }).eq('id', originalInvoice.id);
    } catch (invError) {
      console.error('[Refund] Error actualizando factura original:', invError);
    }
  }

  // 7. El estado (refunded/cancelled al llegar a 0) ya lo puso la función SQL. Aquí solo la nota.
  const nota = `[REEMBOLSO ${completo ? 'FINAL' : 'PARCIAL'} ${now}] ${monto} · ${reason}${completo ? '' : ` · restante ${Number(r.restante ?? 0)}`}`;
  await supabase.from('web_orders').update({ internal_notes: [order.internal_notes, nota].filter(Boolean).join('\n'), updated_at: now }).eq('id', order.id);
  await supabase.rpc('fn_web_order_reembolso_cerrar', { p_refund_id: r.refund_id, p_ok: true, p_credit_note_id: nc.creditNoteId ?? null });

  return {
    status: 200,
    body: {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      refundId: r.refund_id,
      refundAmount: monto,
      isFullRefund: completo,
      restante: Number(r.restante ?? 0),
      creditNoteId: nc.creditNoteId,
      creditNoteNumber: nc.creditNoteNumber,
      stockErrors,
    },
  };
}
