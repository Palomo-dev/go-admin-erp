// ============================================================
// POST /api/integrations/bold/webhook
// Recibe notificaciones de Bold (callback del proveedor).
// Sin autenticacion: es un endpoint publico invocado por Bold.
// IMPORTANTE: responde 200 inmediatamente para evitar reintentos infinitos.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { boldService, type BoldWebhookEvent } from '@/lib/services/integrations/bold';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo (para verificacion de firma)
    const rawBody = await request.text();

    // Log del payload recibido
    console.log('[Bold Webhook] Payload recibido:', rawBody);

    // Parsear el body como JSON
    const event: BoldWebhookEvent = JSON.parse(rawBody);

    // Extraer connectionId de query params o del payload
    const url = new URL(request.url);
    const connectionId =
      url.searchParams.get('connectionId') ??
      (event as Record<string, unknown>).connection_id as string | undefined ??
      (event.data as Record<string, unknown> | undefined)?.connection_id as
        | string
        | undefined;

    if (!connectionId) {
      console.error(
        '[Bold Webhook] No se encontro connectionId en query params ni en el payload'
      );
      // Responder 200 igualmente para evitar reintentos
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Verificacion de firma HMAC-SHA256 (header x-bold-signature)
    const signature = request.headers.get('x-bold-signature');
    if (!signature) {
      console.warn('[Bold Webhook] Webhook recibido sin firma x-bold-signature');
      return NextResponse.json(
        { error: 'Firma requerida' },
        { status: 401 }
      );
    }

    // Obtener secret_key de integration_credentials
    const supabaseAdmin = getSupabaseAdmin();
    const { data: creds } = await supabaseAdmin
      .from('integration_credentials')
      .select('secret_ref')
      .eq('connection_id', connectionId)
      .eq('purpose', 'webhook_secret')
      .eq('status', 'active')
      .single();

    if (!creds?.secret_ref) {
      console.warn(
        '[Bold Webhook] No se encontro webhook_secret para verificar firma'
      );
      return NextResponse.json(
        { error: 'No se encontro secreto de webhook' },
        { status: 401 }
      );
    }

    const isValid = boldService.verifyWebhookSignature(
      rawBody,
      signature,
      creds.secret_ref
    );
    if (!isValid) {
      console.error('[Bold Webhook] Firma invalida');
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 });
    }

    console.log('[Bold Webhook] Firma verificada correctamente');

    // Registrar evento en integration_events
    await supabaseAdmin
      .from('integration_events')
      .insert({
        connection_id: connectionId,
        provider_code: 'bold',
        event_type: event.event_type ?? event.type ?? 'webhook',
        external_id:
          (event.data as Record<string, unknown> | undefined)?.id as
            | string
            | undefined ?? null,
        payload: event,
        received_at: new Date().toISOString(),
        status: 'received',
      });

    // Responder 200 inmediatamente y procesar en background
    // (max 2s para no bloquear la respuesta a Bold)
    boldService
      .processWebhook(event, connectionId)
      .catch((procErr: unknown) => {
        console.error('[Bold Webhook] Error procesando en background:', procErr);
      });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Bold no reintente
    console.error('[Bold Webhook] Error:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
