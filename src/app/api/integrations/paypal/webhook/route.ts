import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { paypalService } from '@/lib/services/integrations/paypal';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extraer headers de verificación de PayPal
    const authAlgo = request.headers.get('paypal-auth-algo') || '';
    const certUrl = request.headers.get('paypal-cert-url') || '';
    const transmissionId = request.headers.get('paypal-transmission-id') || '';
    const transmissionSig = request.headers.get('paypal-transmission-sig') || '';
    const transmissionTime = request.headers.get('paypal-transmission-time') || '';

    // Buscar conexiones activas de PayPal
    const { data: connections } = await supabaseAdmin
      .from('integration_connections')
      .select(`
        id,
        environment,
        integration_connectors!inner (
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', 'active');

    const paypalConnections = (connections || []).filter((c: Record<string, unknown>) => {
      const connectors = c.integration_connectors as Record<string, unknown> | undefined;
      const providers = connectors?.integration_providers as Record<string, unknown> | undefined;
      return providers?.code === 'paypal';
    });

    let verified = false;

    for (const conn of paypalConnections) {
      const creds = await paypalService.getCredentials(conn.id as string);
      if (!creds?.clientId || !creds?.clientSecret || !creds?.webhookId) continue;

      const isSandbox = (conn as Record<string, unknown>).environment !== 'production';

      const isValid = await paypalService.verifyWebhookSignature(
        creds,
        {
          authAlgo,
          certUrl,
          transmissionId,
          transmissionSig,
          transmissionTime,
          webhookId: creds.webhookId,
          webhookEvent: body,
        },
        isSandbox
      );

      if (isValid) {
        verified = true;

        // Registrar evento en integration_events
        await supabaseAdmin.from('integration_events').insert({
          connection_id: conn.id,
          event_type: body.event_type || 'unknown',
          payload: {
            event_id: body.id,
            event_type: body.event_type,
            resource_type: body.resource_type,
            summary: body.summary,
            resource_id: body.resource?.id,
            verified: true,
          },
          status: 'processed',
        });

        break;
      }
    }

    if (!verified && paypalConnections.length > 0) {
      console.warn('PayPal webhook: firma no verificada para evento:', body.id);
    }

    // PayPal espera HTTP 200 para confirmar recepción
    return NextResponse.json({ received: true, verified });
  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
