import { NextRequest, NextResponse } from 'next/server';
import { webOrderServerConfirmation } from '@/lib/services/webOrderServerConfirmation';

/**
 * POST /api/web-orders/[id]/auto-confirm
 *
 * Auto-confirma un pedido web que ya fue pagado, creando automáticamente:
 * - sale + sale_items (venta POS)
 * - invoice_sales + invoice_items (factura de venta)
 * - payments (registro de pago)
 * - accounts_receivable (cuenta por cobrar)
 * - stock decrement (descuento de inventario)
 * - shipment (envío, si es delivery)
 *
 * Este endpoint está diseñado para ser llamado por los webhooks de pasarelas de pago
 * del website (goadmin-websites) después de que el pago sea confirmado.
 *
 * Es idempotente: si el pedido ya tiene sale_id, retorna sin hacer nada.
 *
 * Autenticación: usa service_role key (no requiere sesión de usuario).
 * El website debe enviar el header `x-webhook-secret` con el valor de CRON_SECRET
 * para validar que la llamada viene del website.
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

    // Validar secreto compartido (opcional, pero recomendado)
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && webhookSecret !== expectedSecret) {
      // Si no hay CRON_SECRET configurado, permitir sin validación (compatibilidad)
      // Si hay CRON_SECRET, validar
      return NextResponse.json(
        { error: 'Secreto de webhook inválido' },
        { status: 401 }
      );
    }

    const result = await webOrderServerConfirmation.autoConfirmPaidOrder(orderId);

    return NextResponse.json({
      success: true,
      message: 'Pedido auto-confirmado exitosamente',
      ...result,
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/web-orders/[id]/auto-confirm:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
