import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { stripeClientService } from '@/lib/services/integrations/stripe';
import { STRIPE_CLIENT_CREDENTIAL_PURPOSES } from '@/lib/services/integrations/stripe/stripeClientConfig';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No stripe-signature header' }, { status: 400 });
    }

    // Buscar conexiones activas de Stripe (integración de clientes)
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

    const stripeConnections = (connections || []).filter((c: Record<string, unknown>) => {
      const connectors = c.integration_connectors as Record<string, unknown> | undefined;
      const providers = connectors?.integration_providers as Record<string, unknown> | undefined;
      return providers?.code === 'stripe';
    });

    let verified = false;
    let parsedEvent: Record<string, unknown> | null = null;

    for (const conn of stripeConnections) {
      const creds = await stripeClientService.getCredentials(conn.id as string);
      if (!creds?.secretKey || !creds?.webhookSecret) continue;

      try {
        const event = stripeClientService.verifyWebhookEvent(
          creds.secretKey,
          rawBody,
          signature,
          creds.webhookSecret
        );

        verified = true;
        parsedEvent = event as unknown as Record<string, unknown>;

        // Registrar evento en integration_events
        await getSupabaseAdmin().from('integration_events').insert({
          connection_id: conn.id,
          event_type: event.type,
          payload: {
            event_id: event.id,
            type: event.type,
            livemode: event.livemode,
            data: event.data?.object ? { id: (event.data.object as Record<string, unknown>).id } : {},
            verified: true,
          },
          status: 'processed',
        });

        break;
      } catch {
        // Firma no coincide con esta conexión, probar la siguiente
        continue;
      }
    }

    if (!verified) {
      console.warn('Stripe client webhook: firma no verificada');
      return NextResponse.json({ received: true, verified: false });
    }

    return NextResponse.json({ received: true, verified: true, type: parsedEvent?.type });
  } catch (error) {
    console.error('Error processing Stripe client webhook:', error);
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
