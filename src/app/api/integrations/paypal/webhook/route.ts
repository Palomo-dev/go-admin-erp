// ============================================================
// POST /api/integrations/paypal/webhook
// Eventos de webhook de PayPal.
//
// Credencial del proveedor: `client_id`/`client_secret` y el `webhook_id` de
// la conexión (`integration_credentials`). La firma (cabeceras
// `paypal-transmission-*`, `paypal-cert-url`, `paypal-auth-algo`) se valida
// con la API `verify-webhook-signature` de PayPal usando esas credenciales.
//
// SEGURIDAD (GO-sec, 2026-09-24): un evento que ninguna conexión verificaba
// respondía 200 `verified: false`; ahora es FAIL-CLOSED → 401 sin escribir
// nada. El evento se registra en la conexión que lo verificó y en su
// organización (antes el insert omitía `source`/`direction`, NOT NULL, y
// fallaba en silencio).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { paypalService } from '@/lib/services/integrations/paypal';

type Fila = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const authAlgo = request.headers.get('paypal-auth-algo') || '';
    const certUrl = request.headers.get('paypal-cert-url') || '';
    const transmissionId = request.headers.get('paypal-transmission-id') || '';
    const transmissionSig = request.headers.get('paypal-transmission-sig') || '';
    const transmissionTime = request.headers.get('paypal-transmission-time') || '';
    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
      console.warn('[PayPal Webhook] rechazado (fail-closed): faltan cabeceras de firma');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }

    let body: Fila;
    try {
      body = (await request.json()) as Fila;
    } catch {
      return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: connections } = await admin
      .from('integration_connections')
      .select(`
        id,
        organization_id,
        environment,
        integration_connectors!inner (
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', INTEGRATION_CONNECTION_USABLE_STATUS);

    const paypalConnections = ((connections as Fila[] | null) || []).filter((c) => {
      const connectors = c.integration_connectors as Fila | undefined;
      const providers = connectors?.integration_providers as Fila | undefined;
      return providers?.code === 'paypal';
    });

    for (const conn of paypalConnections) {
      const creds = await paypalService.getCredentials(conn.id as string, admin);
      if (!creds?.clientId || !creds?.clientSecret || !creds?.webhookId) continue;

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
        conn.environment !== 'production',
      );
      if (!isValid) continue;

      const resource = (body.resource as Fila | undefined) ?? {};
      await admin.from('integration_events').insert({
        connection_id: conn.id,
        organization_id: Number(conn.organization_id),
        source: 'webhook',
        direction: 'inbound',
        event_type: typeof body.event_type === 'string' ? body.event_type : 'unknown',
        external_event_id: typeof body.id === 'string' ? body.id : null,
        payload: {
          event_id: body.id,
          event_type: body.event_type,
          resource_type: body.resource_type,
          summary: body.summary,
          resource_id: resource.id,
          verified: true,
        },
        status: 'processed',
      });

      // PayPal espera HTTP 200 para confirmar recepción
      return NextResponse.json({ received: true, verified: true });
    }

    console.warn('[PayPal Webhook] rechazado (fail-closed): ninguna conexión verifica el evento');
    return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
