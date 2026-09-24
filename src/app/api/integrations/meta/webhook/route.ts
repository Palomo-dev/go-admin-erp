// ============================================================
// /api/integrations/meta/webhook — webhook de Meta Marketing.
//
// GET: verificación de suscripción. Credencial: `META_WEBHOOK_VERIFY_TOKEN`
//   (entorno). Fail-closed: sin la variable → 403. Antes caía a un token por
//   defecto escrito en el código (repositorio público).
// POST: eventos. Credencial: el App Secret de la conexión `meta_marketing`
//   (`integration_credentials`, `appSecret`); Meta firma el raw body con
//   HMAC-SHA256 en `x-hub-signature-256`, comparado en tiempo constante.
//
// SEGURIDAD (GO-sec, 2026-09-24): un evento que ninguna conexión verificaba
// respondía 200 `verified: false`; ahora es FAIL-CLOSED → 401 sin escribir
// nada. El evento se registra en la conexión que firmó y en su organización
// (antes el insert omitía `source`/`direction`, NOT NULL, y fallaba en
// silencio).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { verificarSuscripcionWebhook } from '@/lib/security/suscripcionWebhook';

type Fila = Record<string, unknown>;

// GET: Verificación del webhook (Facebook envía challenge)
export async function GET(request: NextRequest) {
  return verificarSuscripcionWebhook(request, {
    variable: 'META_WEBHOOK_VERIFY_TOKEN',
    parametroToken: 'hub.verify_token',
    parametroDesafio: 'hub.challenge',
    parametroModo: 'hub.mode',
    etiqueta: 'Meta Webhook',
  });
}

// POST: Recibir eventos del webhook
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    if (!signature) {
      console.warn('[Meta Webhook] rechazado (fail-closed): sin x-hub-signature-256');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }

    let body: Fila;
    try {
      body = JSON.parse(rawBody) as Fila;
    } catch {
      return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: connections } = await admin
      .from('integration_connections')
      .select(`
        id,
        organization_id,
        integration_connectors!inner (
          code,
          provider_id,
          integration_providers!inner ( code )
        )
      `)
      .eq('status', INTEGRATION_CONNECTION_USABLE_STATUS);

    const metaConnections = ((connections as Fila[] | null) || []).filter((c) => {
      const connectors = c.integration_connectors as Fila | undefined;
      return connectors?.code === 'meta_marketing';
    });

    for (const conn of metaConnections) {
      const creds = await metaMarketingService.getCredentials(conn.id as string, admin);
      if (!creds?.appSecret) continue;
      if (!metaMarketingService.verifyWebhookSignature(rawBody, signature, creds.appSecret)) continue;

      const entries = Array.isArray(body.entry) ? (body.entry as Fila[]) : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? (entry.changes as Fila[]) : [];
        for (const change of changes) {
          await admin.from('integration_events').insert({
            connection_id: conn.id,
            organization_id: Number(conn.organization_id),
            source: 'webhook',
            direction: 'inbound',
            event_type: `meta.${String(body.object)}.${String(change.field)}`,
            payload: {
              object: body.object,
              entry_id: entry.id,
              entry_time: entry.time,
              field: change.field,
              value: change.value,
              verified: true,
            },
            status: 'processed',
          });
        }
      }

      return NextResponse.json({ received: true, verified: true });
    }

    console.warn('[Meta Webhook] rechazado (fail-closed): ninguna conexión valida la firma');
    return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('[Meta Webhook] Error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ received: true, error: 'Internal error' }, { status: 200 });
  }
}
