// ============================================================
// POST /api/integrations/breb/webhook
// Recibe notificaciones de Mono (callback del proveedor).
// Endpoint publico invocado por Mono; la unica puerta es la firma.
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §2.2 «Webhooks de cobro»): antes,
// sin header `X-Signature` o sin `webhook_secret` configurado, el webhook se
// procesaba igual (solo un warn) y un «pagado» falso creaba un `payment
// completed`. Ahora es FAIL-CLOSED: sin firma, sin secreto activo o con firma
// invalida → 401 y no se procesa nada. El body ya no va a los logs.
// Con firma valida responde 200 aunque falle el procesamiento (sin reintentos).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { monoService, type MonoWebhookPayload } from '@/lib/services/integrations/breb';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo (la firma se calcula sobre el body exacto)
    const rawBody = await request.text();

    // Extraer connectionId de query params
    const url = new URL(request.url);
    const connectionId = url.searchParams.get('connectionId') ?? undefined;
    const signature = request.headers.get('X-Signature');

    if (!connectionId || !signature) {
      console.warn('[BreB Webhook] rechazado: falta connectionId o X-Signature (fail-closed)');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }

    // Verificacion de firma HMAC-SHA256 con el webhook_secret activo de la conexion
    const supabaseAdmin = getSupabaseAdmin();
    const { data: creds, error: credsError } = await supabaseAdmin
      .from('integration_credentials')
      .select('secret_ref')
      .eq('connection_id', connectionId)
      .eq('purpose', 'webhook_secret')
      .eq('status', 'active')
      .single();

    if (credsError || !creds?.secret_ref) {
      console.warn('[BreB Webhook] rechazado: sin webhook_secret activo para la conexion (fail-closed)');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }

    if (!monoService.verifyWebhookSignature(rawBody, signature, creds.secret_ref)) {
      console.error('[BreB Webhook] Firma invalida');
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 });
    }

    // Parsear el body como JSON (solo despues de verificar)
    let payload: MonoWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as MonoWebhookPayload;
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    // Procesar webhook via servicio
    await monoService.processWebhook(connectionId, payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Mono no reintente
    console.error('[BreB Webhook] Error procesando:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
