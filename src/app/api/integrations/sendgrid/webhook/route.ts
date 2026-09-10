// ============================================================
// POST /api/integrations/sendgrid/webhook
// Recibe eventos del Event Webhook de SendGrid
// (processed, delivered, bounce, open, click, etc.)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendgridService } from '@/lib/services/integrations/sendgrid';
import type { SendGridWebhookEvent } from '@/lib/services/integrations/sendgrid/sendgridTypes';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    let events: SendGridWebhookEvent[];

    try {
      events = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    // SendGrid envía un array de eventos en cada POST
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'Se esperaba un array de eventos' }, { status: 400 });
    }

    // F0 (C6 msg): firma ECDSA obligatoria (fail-closed). Sin clave configurada
    // o sin cabeceras de firma → 403.
    const signature = request.headers.get('X-Twilio-Email-Event-Webhook-Signature') || '';
    const timestamp = request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp') || '';

    if (!process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY) {
      console.error('[SendGrid Webhook] SENDGRID_WEBHOOK_VERIFICATION_KEY no configurada. Rechazado.');
      return NextResponse.json({ error: 'signature_not_configured' }, { status: 403 });
    }
    if (!signature || !timestamp) {
      console.warn('[SendGrid Webhook] Faltan cabeceras de firma. Rechazado.');
      return NextResponse.json({ error: 'signature_missing' }, { status: 403 });
    }
    const isValid = sendgridService.verifyWebhookSignature(signature, timestamp, body);
    if (!isValid) {
      console.error('[SendGrid Webhook] Firma ECDSA inválida');
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Conexiones SendGrid activas (los eventos no traen org_id)
    const { data: connections } = await supabaseAdmin
      .from('integration_connections')
      .select(`
        id, organization_id,
        connector:integration_connectors!inner(code)
      `)
      .eq('integration_connectors.code', 'sendgrid_email')
      .eq('status', 'connected');

    if (!connections || connections.length === 0) {
      console.warn('[SendGrid Webhook] No hay conexiones SendGrid activas');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Procesar cada evento
    for (const event of events) {
      // F0 (C6 msg): la conexión se resuelve SOLO por el evento email.send previo
      // (sg_message_id). Sin correspondencia → se ignora el evento (nunca connections[0]).
      let matchedConnection: (typeof connections)[number] | null = null;

      if (event.sg_message_id) {
        const { data: prevEvent } = await supabaseAdmin
          .from('integration_events')
          .select('connection_id')
          .eq('external_event_id', event.sg_message_id.split('.')[0])
          .eq('event_type', 'email.send')
          .maybeSingle();

        if (prevEvent) {
          matchedConnection = connections.find((c) => c.id === prevEvent.connection_id) ?? null;
        }
      }

      if (!matchedConnection) {
        console.warn('[SendGrid Webhook] Evento sin conexión resoluble; ignorado', { event: event.event, sg_message_id: event.sg_message_id });
        continue;
      }

      // Registrar evento en integration_events
      await supabaseAdmin.from('integration_events').insert({
        connection_id: matchedConnection.id,
        organization_id: matchedConnection.organization_id,
        source: 'webhook',
        direction: 'inbound',
        event_type: `email.${event.event}`,
        external_event_id: event.sg_event_id || event.sg_message_id || null,
        payload: event as unknown as Record<string, unknown>,
        status: 'received',
        // event_time es GENERATED ALWAYS AS (created_at) en integration_events,
        // no se puede insertar manualmente. El timestamp original de SendGrid
        // se conserva dentro de payload.event.timestamp.
      });

      // Procesar eventos específicos
      await processWebhookEvent(matchedConnection.id, matchedConnection.organization_id, event);
    }

    // Actualizar last_activity_at de las conexiones involucradas
    const connectionIds = Array.from(new Set(connections.map((c) => c.id)));
    for (const connId of connectionIds) {
      await supabaseAdmin
        .from('integration_connections')
        .update({
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connId);
    }

    return NextResponse.json({ received: true, processed: events.length }, { status: 200 });
  } catch (err) {
    console.error('[SendGrid Webhook] Error procesando:', err);
    // Siempre retornar 200 para que SendGrid no reintente
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

// ----------------------------------------------------------
// Procesar evento individual del webhook
// ----------------------------------------------------------
async function processWebhookEvent(
  connectionId: string,
  organizationId: number,
  event: SendGridWebhookEvent
) {
  const supabaseAdmin = getSupabaseAdmin();

  switch (event.event) {
    case 'bounce':
    case 'dropped': {
      console.warn(
        `[SendGrid Webhook] ${event.event}: ${event.email} - ${event.reason || 'Sin razón'}`
      );

      // Marcar notificaciones pendientes a ese email como fallidas
      if (event.email) {
        await supabaseAdmin
          .from('notifications')
          .update({
            status: 'failed',
            error_msg: `${event.event}: ${event.reason || 'Email rebotado/rechazado'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('recipient_email', event.email)
          .eq('status', 'pending');
      }

      // Marcar evento como procesado
      await supabaseAdmin
        .from('integration_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('external_event_id', event.sg_event_id)
        .eq('connection_id', connectionId);
      break;
    }

    case 'delivered': {
      // Actualizar evento de envío original como entregado
      if (event.sg_message_id) {
        await supabaseAdmin
          .from('integration_events')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
          })
          .eq('external_event_id', event.sg_event_id)
          .eq('connection_id', connectionId);
      }
      break;
    }

    case 'spamreport':
    case 'unsubscribe': {
      console.warn(
        `[SendGrid Webhook] ${event.event}: ${event.email} (org: ${organizationId})`
      );

      // Marcar notificaciones pendientes como fallidas para evitar futuros envíos
      if (event.email) {
        await supabaseAdmin
          .from('notifications')
          .update({
            status: 'failed',
            error_msg: `${event.event}: Destinatario reportó spam o se desuscribió`,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .eq('recipient_email', event.email)
          .eq('status', 'pending');
      }

      await supabaseAdmin
        .from('integration_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('external_event_id', event.sg_event_id)
        .eq('connection_id', connectionId);
      break;
    }

    default: {
      // open, click, deferred, processed → marcar como procesado
      await supabaseAdmin
        .from('integration_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('external_event_id', event.sg_event_id)
        .eq('connection_id', connectionId);
      break;
    }
  }
}
