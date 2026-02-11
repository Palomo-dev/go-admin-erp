import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';
import { MERCADOPAGO_API_BASE } from '@/lib/services/integrations/mercadopago';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const xSignature = request.headers.get('x-signature') || '';
    const xRequestId = request.headers.get('x-request-id') || '';

    // Parsear notificación
    const notification = mercadopagoService.parseWebhookNotification(body);
    if (!notification) {
      return NextResponse.json({ error: 'Notificación inválida' }, { status: 400 });
    }

    // Solo procesar eventos de tipo payment
    if (notification.type !== 'payment') {
      return NextResponse.json({ received: true, skipped: true });
    }

    const paymentId = notification.data.id;

    // Buscar conexión activa de MercadoPago para obtener credenciales
    const { data: connections } = await getSupabaseAdmin()
      .from('integration_connections')
      .select(`
        id,
        integration_connectors!inner (
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', 'active');

    // Filtrar conexiones de MercadoPago
    const mpConnections = (connections || []).filter((c: Record<string, unknown>) => {
      const connectors = c.integration_connectors as Record<string, unknown> | undefined;
      const providers = connectors?.integration_providers as Record<string, unknown> | undefined;
      return providers?.code === 'mercadopago';
    });

    let verified = false;
    let paymentData = null;

    for (const conn of mpConnections) {
      const creds = await mercadopagoService.getCredentials(conn.id as string);
      if (!creds?.accessToken || !creds?.webhookSecret) continue;

      // Verificar firma
      if (xSignature && creds.webhookSecret) {
        const isValid = mercadopagoService.verifyWebhook(
          xSignature,
          xRequestId,
          paymentId,
          creds.webhookSecret
        );

        if (!isValid) continue;
        verified = true;
      }

      // Consultar pago completo
      try {
        const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${creds.accessToken}` },
        });

        if (response.ok) {
          paymentData = await response.json();
          break;
        }
      } catch {
        continue;
      }
    }

    if (!paymentData) {
      console.warn(`MercadoPago webhook: no se pudo obtener pago ${paymentId}`);
      return NextResponse.json({ received: true, processed: false });
    }

    // Registrar evento en integration_events
    await getSupabaseAdmin().from('integration_events').insert({
      connection_id: mpConnections[0]?.id,
      event_type: notification.action,
      payload: {
        payment_id: paymentId,
        status: paymentData.status,
        status_detail: paymentData.status_detail,
        amount: paymentData.transaction_amount,
        payment_method: paymentData.payment_method_id,
        verified,
      },
      status: 'processed',
    });

    return NextResponse.json({
      received: true,
      processed: true,
      payment_status: paymentData.status,
    });
  } catch (error) {
    console.error('Error processing MercadoPago webhook:', error);
    // Siempre retornar 200 para evitar reintentos innecesarios
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
