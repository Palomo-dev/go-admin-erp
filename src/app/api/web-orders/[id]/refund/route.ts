import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceNumberWithClient } from '@/lib/utils/invoiceUtils';

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
 * Soporta reembolso total y parcial.
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
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    if (!orderId) {
      return NextResponse.json({ error: 'ID del pedido es requerido' }, { status: 400 });
    }

    // Validar secreto compartido
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Secreto de webhook inválido' }, { status: 401 });
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

    // 2. Buscar la factura original (invoice_sales con sale_id = order.sale_id)
    const { data: originalInvoice } = await supabase
      .from('invoice_sales')
      .select('id, number, total, balance, status')
      .eq('sale_id', order.sale_id)
      .eq('document_type', 'invoice')
      .limit(1)
      .maybeSingle();

    // 3. Crear nota crédito
    let creditNoteId: string | undefined;
    let creditNoteNumber: string | undefined;

    try {
      creditNoteNumber = await generateInvoiceNumberWithClient(
        supabase,
        order.organization_id,
        'NC'
      );

      const creditNoteTotal = isFullRefund ? orderTotal : effectiveRefundAmount;
      const creditNoteSubtotal = isFullRefund
        ? Number(order.subtotal) || 0
        : effectiveRefundAmount - (Number(order.tax_total) || 0);
      const creditNoteTax = isFullRefund ? Number(order.tax_total) || 0 : 0;

      const { data: creditNote, error: cnError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          customer_id: order.customer_id || null,
          sale_id: order.sale_id,
          related_invoice_id: originalInvoice?.id || null,
          number: creditNoteNumber,
          issue_date: now,
          due_date: now,
          currency: 'COP',
          subtotal: creditNoteSubtotal,
          tax_total: creditNoteTax,
          total: creditNoteTotal,
          balance: 0,
          status: 'paid',
          payment_method: order.payment_method || 'card',
          payment_terms: 0,
          document_type: 'credit_note',
          notes: `Nota crédito por reembolso web - Pedido ${order.order_number}. ${reason}`,
        })
        .select('id, number')
        .single();

      if (cnError) {
        console.error('[Refund] Error creando nota crédito:', cnError);
      } else {
        creditNoteId = creditNote.id;
        creditNoteNumber = creditNote.number;

        // Crear invoice_items para la nota crédito
        const itemsToRefund = partialItems.length > 0
          ? (order.items || []).filter((item: any) =>
              partialItems.some(pi => pi.product_id === item.product_id)
            )
          : (order.items || []);

        const creditNoteItems = itemsToRefund.map((item: any) => {
          const partialQty = partialItems.find(pi => pi.product_id === item.product_id)?.quantity;
          const qty = partialQty || item.quantity;
          return {
            invoice_id: creditNote.id,
            invoice_sales_id: creditNote.id,
            invoice_type: 'credit_note',
            product_id: item.product_id,
            description: `Devolución: ${item.product_name || 'Producto web'}`.substring(0, 255),
            qty: qty,
            unit_price: Number(item.unit_price) || 0,
            total_line: (Number(item.unit_price) || 0) * qty,
            tax_rate: 0,
            discount_amount: 0,
            tax_included: false,
          };
        });

        if (creditNoteItems.length > 0) {
          await supabase.from('invoice_items').insert(creditNoteItems);
        }
      }
    } catch (cnError) {
      console.error('[Refund] Error en creación de nota crédito:', cnError);
    }

    // 4. Devolver stock al inventario
    const stockErrors: string[] = [];
    const itemsToReturn = partialItems.length > 0
      ? partialItems
      : (order.items || []).map((item: any) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity) || 0,
        }));

    for (const item of itemsToReturn) {
      if (!item.product_id || item.quantity <= 0) continue;

      // Verificar si el producto rastrea stock
      const { data: product } = await supabase
        .from('products')
        .select('track_stock')
        .eq('id', item.product_id)
        .maybeSingle();

      if (!product || product.track_stock === false) continue;

      // Incrementar qty_on_hand
      const { data: stockLevel } = await supabase
        .from('stock_levels')
        .select('id, qty_on_hand')
        .eq('product_id', item.product_id)
        .eq('branch_id', order.branch_id)
        .is('lot_id', null)
        .limit(1)
        .maybeSingle();

      if (stockLevel) {
        await supabase
          .from('stock_levels')
          .update({
            qty_on_hand: (Number(stockLevel.qty_on_hand) || 0) + item.quantity,
            updated_at: now,
          })
          .eq('id', stockLevel.id);
      } else {
        await supabase
          .from('stock_levels')
          .insert({
            product_id: item.product_id,
            branch_id: order.branch_id,
            lot_id: null,
            qty_on_hand: item.quantity,
            qty_reserved: 0,
            avg_cost: 0,
            min_level: 0,
          });
      }

      // Crear movimiento de stock (devolución)
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          product_id: item.product_id,
          lot_id: null,
          direction: 'in',
          qty: item.quantity,
          unit_cost: 0,
          source: 'web_refund',
          source_id: String(order.id),
          note: `Devolución por reembolso - Pedido ${order.order_number}`,
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

    // 7. Marcar web_orders como reembolsada
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
