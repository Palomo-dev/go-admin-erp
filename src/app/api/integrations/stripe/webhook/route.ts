// ============================================================
// POST /api/integrations/stripe/webhook
// Eventos de la cuenta de Stripe de una organización cliente (no el billing
// de GO Admin, que vive en /api/stripe/**).
//
// Credencial del proveedor: el «signing secret» del endpoint (`whsec_…`),
// guardado en `integration_credentials` de la conexión (`webhookSecret`).
// Stripe firma el raw body en la cabecera `stripe-signature` y se verifica
// con `constructEvent` (`stripeClientService.verifyWebhookEvent`).
//
// SEGURIDAD (GO-sec, 2026-09-24): un evento que ninguna conexión verificaba
// respondía 200 `verified: false` (y sin cabecera, 400); ahora es FAIL-CLOSED
// → 401 sin escribir nada. El evento se registra en la conexión cuyo secreto
// lo verificó y en su organización (antes el insert omitía `source`/
// `direction`, NOT NULL, y fallaba en silencio).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { stripeClientService } from '@/lib/services/integrations/stripe';

type Fila = Record<string, unknown>;

function noAutorizado(motivo: string) {
  console.warn(`[Stripe Webhook clientes] rechazado (fail-closed): ${motivo}`);
  return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    if (!signature) return noAutorizado('sin stripe-signature');

    const admin = getSupabaseAdmin();
    const { data: connections } = await admin
      .from('integration_connections')
      .select(`
        id,
        organization_id,
        integration_connectors!inner (
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', INTEGRATION_CONNECTION_USABLE_STATUS);

    const stripeConnections = ((connections as Fila[] | null) || []).filter((c) => {
      const connectors = c.integration_connectors as Fila | undefined;
      const providers = connectors?.integration_providers as Fila | undefined;
      return providers?.code === 'stripe';
    });

    for (const conn of stripeConnections) {
      const creds = await stripeClientService.getCredentials(conn.id as string, admin);
      if (!creds?.secretKey || !creds?.webhookSecret) continue;

      let event;
      try {
        event = stripeClientService.verifyWebhookEvent(creds.secretKey, rawBody, signature, creds.webhookSecret);
      } catch {
        continue; // la firma no es de esta conexión
      }

      await admin.from('integration_events').insert({
        connection_id: conn.id,
        organization_id: Number(conn.organization_id),
        source: 'webhook',
        direction: 'inbound',
        event_type: event.type,
        external_event_id: event.id,
        payload: {
          event_id: event.id,
          type: event.type,
          livemode: event.livemode,
          data: event.data?.object ? { id: (event.data.object as unknown as Fila).id } : {},
          verified: true,
        },
        status: 'processed',
      });

      return NextResponse.json({ received: true, verified: true, type: event.type });
    }

    return noAutorizado('ninguna conexión con secreto verifica la firma');
  } catch (error) {
    console.error('[Stripe Webhook clientes] Error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
