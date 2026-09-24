// ============================================================
// POST /api/integrations/mercadopago/webhook
// Notificaciones de MercadoPago (Webhooks v2).
//
// Credencial del proveedor: el «secret» de la firma de webhooks de la
// aplicación de MercadoPago, guardado en `integration_credentials` de la
// conexión (`webhookSecret`). MercadoPago firma con HMAC-SHA256 la plantilla
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y manda
// `x-signature: ts=…,v1=…` y `x-request-id`.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes la firma era OPCIONAL (sin
// `x-signature` se consultaba el pago igual) y el evento se registraba en la
// primera conexión de MercadoPago de CUALQUIER organización. Ahora es
// FAIL-CLOSED: sin firma, sin secreto o con firma que no valida ninguna
// conexión → 401 sin procesar; el pago se consulta con el token de la conexión
// que firmó y el evento se registra en ESA conexión y su organización.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';
import { MERCADOPAGO_API_BASE } from '@/lib/services/integrations/mercadopago';

type Fila = Record<string, unknown>;

function noAutorizado(motivo: string) {
  console.warn(`[MercadoPago Webhook] rechazado (fail-closed): ${motivo}`);
  return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const xSignature = request.headers.get('x-signature') || '';
    const xRequestId = request.headers.get('x-request-id') || '';
    if (!xSignature || !xRequestId) return noAutorizado('sin x-signature o x-request-id');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Notificación inválida' }, { status: 400 });
    }

    const notification = mercadopagoService.parseWebhookNotification(body);
    if (!notification) {
      return NextResponse.json({ error: 'Notificación inválida' }, { status: 400 });
    }
    const paymentId = String(notification.data.id);

    // Conexiones de MercadoPago utilizables; la firma decide cuál es la emisora.
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

    const mpConnections = ((connections as Fila[] | null) || []).filter((c) => {
      const connectors = c.integration_connectors as Fila | undefined;
      const providers = connectors?.integration_providers as Fila | undefined;
      return providers?.code === 'mercadopago';
    });

    let firmante: { id: string; organizationId: number; accessToken: string } | null = null;
    for (const conn of mpConnections) {
      const creds = await mercadopagoService.getCredentials(conn.id as string, admin);
      if (!creds?.accessToken || !creds?.webhookSecret) continue;
      if (!mercadopagoService.verifyWebhook(xSignature, xRequestId, paymentId, creds.webhookSecret)) continue;
      firmante = { id: conn.id as string, organizationId: Number(conn.organization_id), accessToken: creds.accessToken };
      break;
    }
    if (!firmante) return noAutorizado('ninguna conexión con secreto valida la firma');

    // Solo eventos de pago se procesan (la firma ya se verificó).
    if (notification.type !== 'payment') {
      return NextResponse.json({ received: true, skipped: true });
    }

    // Consultar el pago con el token de la conexión que firmó.
    let paymentData: Fila | null = null;
    try {
      const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${firmante.accessToken}` },
      });
      if (response.ok) paymentData = (await response.json()) as Fila;
    } catch {
      paymentData = null;
    }

    if (!paymentData) {
      console.warn('[MercadoPago Webhook] no se pudo obtener el pago de la conexión que firmó');
      return NextResponse.json({ received: true, processed: false });
    }

    await admin.from('integration_events').insert({
      connection_id: firmante.id,
      organization_id: firmante.organizationId,
      source: 'webhook',
      direction: 'inbound',
      event_type: notification.action || 'payment',
      external_event_id: paymentId,
      payload: {
        payment_id: paymentId,
        status: paymentData.status,
        status_detail: paymentData.status_detail,
        amount: paymentData.transaction_amount,
        payment_method: paymentData.payment_method_id,
        verified: true,
      },
      status: 'processed',
    });

    return NextResponse.json({
      received: true,
      processed: true,
      payment_status: paymentData.status,
    });
  } catch (error) {
    console.error('[MercadoPago Webhook] Error:', error instanceof Error ? error.message : String(error));
    // 200 para evitar reintentos de un fallo interno ya registrado
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
