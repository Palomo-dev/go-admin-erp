// ============================================================
// POST /api/integrations/payu/webhook
// Confirmaciones de PayU (página de confirmación).
//
// Credencial del proveedor: la API Key del comercio (`integration_credentials`
// de la conexión). PayU firma con MD5 `ApiKey~merchant_id~reference_sale~
// value~currency~state_pol` en el campo `sign`.
//
// SEGURIDAD (GO-sec, 2026-09-24): una confirmación que ninguna conexión
// verifica respondía 200 `verified: false`; ahora es FAIL-CLOSED → 401 sin
// escribir nada. El evento se registra en la conexión que firmó (la del
// `merchant_id` cuya API Key valida la firma) y en su organización; la
// comparación de la firma es en tiempo constante (`payuService`). Antes el
// insert omitía `source`/`direction` (NOT NULL) y fallaba en silencio.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { payuService } from '@/lib/services/integrations/payu';

type Fila = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    // PayU puede enviar como form-urlencoded o JSON
    const contentType = request.headers.get('content-type') || '';
    let body: Record<string, string>;
    try {
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        body = Object.fromEntries(formData.entries()) as Record<string, string>;
      } else {
        body = await request.json();
      }
    } catch {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    const payload = payuService.parseWebhookPayload(body);
    if (!payload) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

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

    const payuConnections = ((connections as Fila[] | null) || []).filter((c) => {
      const connectors = c.integration_connectors as Fila | undefined;
      const providers = connectors?.integration_providers as Fila | undefined;
      return providers?.code === 'payu';
    });

    for (const conn of payuConnections) {
      const creds = await payuService.getCredentials(conn.id as string, admin);
      if (!creds?.apiKey || !creds?.merchantId) continue;
      if (payload.merchant_id !== creds.merchantId) continue;
      if (!payuService.verifyWebhookSignature(creds.apiKey, creds.merchantId, payload)) continue;

      await admin.from('integration_events').insert({
        connection_id: conn.id,
        organization_id: Number(conn.organization_id),
        source: 'webhook',
        direction: 'inbound',
        event_type: `payment.${payload.state_pol === '4' ? 'approved' : payload.state_pol === '6' ? 'declined' : 'pending'}`,
        external_event_id: payload.transaction_id || payload.reference_pol || null,
        payload: {
          reference_sale: payload.reference_sale,
          reference_pol: payload.reference_pol,
          state_pol: payload.state_pol,
          response_code_pol: payload.response_code_pol,
          value: payload.value,
          currency: payload.currency,
          payment_method: payload.payment_method,
          transaction_id: payload.transaction_id,
          verified: true,
        },
        status: 'processed',
      });

      // PayU espera HTTP 200 para confirmar recepción
      return NextResponse.json({ received: true, verified: true });
    }

    console.warn('[PayU Webhook] rechazado (fail-closed): ninguna conexión valida la firma');
    return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('[PayU Webhook] Error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
