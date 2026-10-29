import { NextRequest, NextResponse } from 'next/server';
import { verifyWebOrdersSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { createClient } from '@supabase/supabase-js';
import { reembolsarPedidoWeb } from '@/lib/services/webOrderRefund';

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
 * Soporta reembolso total y parcial. El parcial NO cancela el pedido (28-oct-2026). Lo reembolsado
 * nunca supera el total: tope en SQL con bloqueo de fila (webOrderRefund.ts). Al llegar a 0 → refunded.
 *   - reference: id del reembolso en la pasarela (opcional; reintentos idempotentes)
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
    const r = await reembolsarPedidoWeb(supabase, orderId, {
      amount: body.amount,
      reason: body.reason,
      items: body.items,
      reference: body.reference ?? body.refund_id ?? null,
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch (error: unknown) {
    console.error('Error in POST /api/web-orders/[id]/refund:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
