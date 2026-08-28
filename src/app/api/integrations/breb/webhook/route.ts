// ============================================================
// POST /api/integrations/breb/webhook
// Recibe notificaciones de Mono (callback del proveedor).
// Sin autenticacion: es un endpoint publico invocado por Mono.
// IMPORTANTE: responde 200 siempre para evitar reintentos infinitos.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { monoService, type MonoWebhookPayload } from '@/lib/services/integrations/breb';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo (para verificacion de firma si aplica)
    const rawBody = await request.text();

    // Log del payload recibido
    console.log('[BreB Webhook] Payload recibido:', rawBody);

    // Parsear el body como JSON
    const payload: MonoWebhookPayload = JSON.parse(rawBody);

    // Extraer connectionId de query params
    const url = new URL(request.url);
    const connectionId = url.searchParams.get('connectionId') ?? undefined;

    if (!connectionId) {
      console.error(
        '[BreB Webhook] No se encontro connectionId en query params'
      );
      // Responder 200 igualmente para evitar reintentos
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Verificacion de firma HMAC-SHA256
    const signature = request.headers.get('X-Signature');
    if (signature) {
      // Obtener webhook secret de integration_credentials
      const supabaseAdmin = getSupabaseAdmin();
      const { data: creds } = await supabaseAdmin
        .from('integration_credentials')
        .select('secret_ref')
        .eq('connection_id', connectionId)
        .eq('purpose', 'webhook_secret')
        .eq('status', 'active')
        .single();

      if (creds?.secret_ref) {
        const isValid = monoService.verifyWebhookSignature(
          rawBody,
          signature,
          creds.secret_ref,
        );
        if (!isValid) {
          console.error('[BreB Webhook] Firma invalida');
          return NextResponse.json(
            { error: 'Firma invalida' },
            { status: 401 },
          );
        }
        console.log('[BreB Webhook] Firma verificada correctamente');
      } else {
        console.warn(
          '[BreB Webhook] No se encontro webhook_secret para verificar firma',
        );
      }
    } else {
      console.warn(
        '[BreB Webhook] Webhook recibido sin firma X-Signature',
      );
    }

    // Procesar webhook via servicio
    await monoService.processWebhook(connectionId, payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Mono no reintente
    console.error('[BreB Webhook] Error procesando:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
