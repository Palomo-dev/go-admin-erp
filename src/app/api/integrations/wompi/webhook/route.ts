// ============================================================
// POST /api/integrations/wompi/webhook
// Recibe eventos de Wompi (transaction.updated, etc.)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { WompiWebhookEvent } from '@/lib/services/integrations/wompi/wompiTypes';

// Usar service role para operaciones del webhook (no hay sesión de usuario)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const event: WompiWebhookEvent = JSON.parse(body);

    // Validar estructura básica del evento
    if (!event.event || !event.data?.transaction || !event.signature) {
      return NextResponse.json(
        { error: 'Evento inválido' },
        { status: 400 }
      );
    }

    const transactionRef = event.data.transaction.reference;
    const transactionId = event.data.transaction.id;
    const status = event.data.transaction.status;

    // Buscar la conexión de Wompi asociada por la referencia
    // Las referencias tienen formato GO-{orgId}-{ts}-{rand}
    const refParts = transactionRef.split('-');
    const orgId = refParts.length >= 2 ? parseInt(refParts[1], 10) : null;

    if (!orgId) {
      console.error('[Wompi Webhook] No se pudo extraer orgId de referencia:', transactionRef);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Buscar conexión activa de Wompi para esta organización
    const { data: connections } = await supabaseAdmin
      .from('integration_connections')
      .select(`
        id, environment,
        connector:integration_connectors(code)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'connected');

    const wompiConnection = connections?.find((c) => {
      const connector = c.connector as { code?: string } | { code?: string }[] | null;
      const code = Array.isArray(connector) ? connector[0]?.code : connector?.code;
      return code === 'wompi_co';
    });

    if (!wompiConnection) {
      console.error('[Wompi Webhook] No se encontró conexión Wompi para org:', orgId);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Obtener secreto de eventos para verificar checksum
    const { data: creds } = await supabaseAdmin
      .from('integration_credentials')
      .select('secret_ref')
      .eq('connection_id', wompiConnection.id)
      .eq('purpose', 'events_secret')
      .eq('status', 'active')
      .single();

    if (creds?.secret_ref) {
      // Verificar checksum
      const isValid = verifyChecksum(event, creds.secret_ref);
      if (!isValid) {
        console.error('[Wompi Webhook] Checksum inválido para transacción:', transactionId);
        return NextResponse.json(
          { error: 'Checksum inválido' },
          { status: 401 }
        );
      }
    }

    // Registrar evento en integration_events
    await supabaseAdmin.from('integration_events').insert({
      connection_id: wompiConnection.id,
      organization_id: orgId,
      source: 'webhook',
      direction: 'inbound',
      event_type: event.event,
      external_event_id: transactionId,
      payload: event as unknown as Record<string, unknown>,
      status: 'received',
      event_time: event.sent_at || new Date().toISOString(),
    });

    // Procesar según tipo de evento
    if (event.event === 'transaction.updated') {
      await processTransactionUpdate(
        orgId,
        transactionRef,
        transactionId,
        status,
        event
      );
    }

    // Actualizar last_activity_at de la conexión
    await supabaseAdmin
      .from('integration_connections')
      .update({
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', wompiConnection.id);

    // Responder 200 para que Wompi no reintente
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[Wompi Webhook] Error procesando:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

// ----------------------------------------------------------
// Verificar checksum SHA256 del evento
// ----------------------------------------------------------
function verifyChecksum(event: WompiWebhookEvent, eventsSecret: string): boolean {
  try {
    const values = event.signature.properties.map((prop) => {
      const keys = prop.split('.');
      let value: unknown = event.data;
      for (const key of keys) {
        value = (value as Record<string, unknown>)[key];
      }
      return value;
    });

    const concatenated = values.join('') + event.timestamp + eventsSecret;
    const calculated = crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex')
      .toUpperCase();

    return calculated === event.signature.checksum;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------
// Procesar actualización de transacción
// ----------------------------------------------------------
async function processTransactionUpdate(
  organizationId: number,
  reference: string,
  transactionId: string,
  status: string,
  event: WompiWebhookEvent
) {
  // Buscar pago asociado por referencia
  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('id, status')
    .eq('reference', reference)
    .eq('organization_id', organizationId)
    .single();

  if (!payment) {
    console.warn('[Wompi Webhook] Pago no encontrado para referencia:', reference);
    return;
  }

  // Mapear estado de Wompi a estado interno
  const statusMap: Record<string, string> = {
    APPROVED: 'completed',
    DECLINED: 'failed',
    VOIDED: 'refunded',
    ERROR: 'failed',
    PENDING: 'pending',
  };

  const internalStatus = statusMap[status] || 'pending';

  // Actualizar pago
  await supabaseAdmin
    .from('payments')
    .update({
      status: internalStatus,
      external_id: transactionId,
      metadata: {
        wompi_status: status,
        wompi_transaction_id: transactionId,
        wompi_payment_method: event.data.transaction.payment_method_type,
        updated_by_webhook: true,
        webhook_received_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id);

  // Marcar evento como procesado
  await supabaseAdmin
    .from('integration_events')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('external_event_id', transactionId)
    .eq('event_type', 'transaction.updated');
}
