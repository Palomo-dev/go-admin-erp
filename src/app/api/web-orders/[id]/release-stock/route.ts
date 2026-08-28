import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/web-orders/[id]/release-stock
 *
 * Libera la reserva de stock (qty_reserved) de un pedido web cuando el pago
 * falla o el pedido se cancela/expira.
 *
 * Es idempotente: si el stock ya fue liberado (stock_released_at IS NOT NULL),
 * la RPC no hace nada y retorna ok=true.
 *
 * Autenticación: usa service_role key. El website debe enviar el header
 * `x-webhook-secret` con el valor de CRON_SECRET.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    if (!orderId) {
      return NextResponse.json(
        { error: 'ID del pedido es requerido' },
        { status: 400 }
      );
    }

    // Validar secreto compartido
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Secreto de webhook inválido' },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Variables de entorno de Supabase no configuradas' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Llamar a la RPC atómica de liberación (idempotente)
    const { data, error } = await supabase.rpc('release_stock_for_order', {
      p_order_id: orderId,
    });

    if (error) {
      console.error('[Release Stock] Error RPC:', error);
      return NextResponse.json(
        { error: `Error liberando stock: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data?.ok) {
      return NextResponse.json(
        { error: data?.error || 'No se pudo liberar el stock' },
        { status: 404 }
      );
    }

    // Si la orden sigue en 'pending', marcarla como 'cancelled'
    // (los webhooks ya la marcan, pero esto cubre el caso de expiración)
    const { data: order } = await supabase
      .from('web_orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (order && order.status === 'pending') {
      await supabase
        .from('web_orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Pago fallido o cancelado',
        })
        .eq('id', orderId);
    }

    return NextResponse.json({
      success: true,
      alreadyReleased: data.already_released || false,
      itemsReleased: data.items_released || 0,
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/web-orders/[id]/release-stock:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
