import { NextRequest, NextResponse } from 'next/server';
import { verifyWebOrdersSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { createClient } from '@supabase/supabase-js';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { crearNotaCreditoPedidoWeb } from '@/lib/services/webOrderCreditNote';

/**
 * POST /api/web-orders/[id]/refund
 *
 * Procesa un reembolso de pedido web de forma completa:
 * 1. Crea nota crédito (invoice_sales con document_type='credit_note') referenciando la factura original
 * 2. Devuelve stock al inventario (incrementa qty_on_hand + stock_movements direction='in')
 * 3. Ajusta accounts_receivable (balance += monto reembolsado)
 * 4. Marca web_orders.payment_status = 'refunded'
 * 5. El asiento contable de reversión se crea automáticamente via trigger trg_auto_journal_credit_note
 *
 * Soporta reembolso total y parcial. El parcial NO cancela el pedido (28-oct-2026).
 *
 * Body:
 *   - amount: monto a reembolsar (opcional, default = total de la orden)
 *   - reason: motivo del reembolso
 *   - items: items específicos a reembolsar (opcional, para reembolso parcial por ítem)
 *
 * Autenticación: usa service_role key. El website debe enviar `x-webhook-secret`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Solo servidor a servidor (tienda web / cron): secreto obligatorio.
  try {
    verifyWebOrdersSecret(request);
  } catch (err) {
    return webhookErrorResponse(err);
  }
  try {
    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID del pedido es requerido' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Variables de entorno no configuradas' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await request.json().catch(() => ({}));
    const refundAmount = Number(body.amount) || 0;
    const reason = body.reason || 'Reembolso solicitado por la pasarela de pago';
    const partialItems: Array<{ product_id: number; quantity: number }> = body.items || [];

    // 1. Cargar el pedido con items
    const { data: order, error: loadError } = await supabase
      .from('web_orders')
      .select(`*, items:web_order_items(*)`)
      .eq('id', orderId)
      .single();

    if (loadError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    // Idempotencia: si ya está reembolsado, no procesar de nuevo
    if (order.payment_status === 'refunded') {
      return NextResponse.json({
        success: true,
        message: 'El pedido ya fue reembolsado',
        alreadyRefunded: true,
      });
    }

    // Solo se puede reembolsar si estuvo pagado
    if (order.payment_status !== 'paid') {
      return NextResponse.json(
        { error: `No se puede reembolsar un pedido con payment_status='${order.payment_status}'` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const orderTotal = Number(order.total) || 0;
    const isFullRefund = refundAmount === 0 || refundAmount >= orderTotal;
    const effectiveRefundAmount = isFullRefund ? orderTotal : refundAmount;

    // 2-3. Nota crédito contra la factura original (servicio compartido con los cambios de pedido).
    const { originalInvoice, creditNoteId, creditNoteNumber } = await crearNotaCreditoPedidoWeb(supabase, order as WebOrder, {
      isFullRefund,
      monto: effectiveRefundAmount,
      motivo: `Nota crédito por reembolso web - Pedido ${order.order_number}. ${reason}`,
      itemsParciales: partialItems,
      now,
    });

    // 4. Devolver stock al inventario
    const stockErrors: string[] = [];
    const itemsToReturn = partialItems.length > 0
      ? partialItems
      : (order.items || []).map((item: { product_id: number; quantity: number | string | null }) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity) || 0,
        }));

    for (const item of itemsToReturn) {
      if (!item.product_id || item.quantity <= 0) continue;

      // Inventario B9: por la primitiva de stock (bloqueo, kardex, lote y costo vigente), con el origen
      // 'web_refund' que ya enlaza la trazabilidad al pedido. Antes se escribía stock_levels a mano y
      // el movimiento entraba a costo 0. Productos sin inventario: la base los salta.
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

      if (movementError) {
        stockErrors.push(`Producto ${item.product_id}: ${movementError.message}`);
      }
    }

    // 5. Ajustar accounts_receivable (si existe)
    if (order.customer_id && originalInvoice) {
      try {
        const { data: ar } = await supabase
          .from('accounts_receivable')
          .select('id, balance, amount')
          .eq('sale_id', order.sale_id)
          .maybeSingle();

        if (ar) {
          const newBalance = (Number(ar.balance) || 0) + effectiveRefundAmount;
          await supabase
            .from('accounts_receivable')
            .update({
              balance: newBalance,
              status: newBalance >= (Number(ar.amount) || 0) ? 'active' : 'partial',
              updated_at: now,
            })
            .eq('id', ar.id);
        }
      } catch (arError) {
        console.error('[Refund] Error ajustando AR:', arError);
      }
    }

    // 6. Actualizar la factura original (balance)
    if (originalInvoice) {
      try {
        const newBalance = (Number(originalInvoice.balance) || 0) + effectiveRefundAmount;
        const newStatus = newBalance >= (Number(originalInvoice.total) || 0)
          ? 'issued'
          : newBalance > 0 ? 'partial' : 'paid';
        await supabase
          .from('invoice_sales')
          .update({
            balance: newBalance,
            status: newStatus,
            updated_at: now,
          })
          .eq('id', originalInvoice.id);
      } catch (invError) {
        console.error('[Refund] Error actualizando factura original:', invError);
      }
    }

    // 7. Total: el pedido queda reembolsado y cancelado. Parcial: el pedido SIGUE vivo
    //    (payment_status 'paid'); solo se deja nota interna. Antes el parcial también cancelaba.
    if (isFullRefund) {
      await supabase
        .from('web_orders')
        .update({
          payment_status: 'refunded',
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: `Reembolso: ${reason}`,
          updated_at: now,
        })
        .eq('id', order.id);
    } else {
      const nota = `[REEMBOLSO PARCIAL ${now}] ${effectiveRefundAmount} · ${reason}`;
      await supabase
        .from('web_orders')
        .update({
          internal_notes: [order.internal_notes, nota].filter(Boolean).join('\n'),
          updated_at: now,
        })
        .eq('id', order.id);
    }

    // El asiento contable de reversión se crea automáticamente via
    // trg_auto_journal_credit_note cuando se inserta la nota crédito.

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      refundAmount: effectiveRefundAmount,
      isFullRefund,
      creditNoteId,
      creditNoteNumber,
      stockErrors,
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/web-orders/[id]/refund:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
