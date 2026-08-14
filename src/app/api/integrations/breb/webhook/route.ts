// ============================================================
// POST /api/integrations/breb/webhook
// Recibe notificaciones de Mono (callback del proveedor).
// Sin autenticacion: es un endpoint publico invocado por Mono.
// IMPORTANTE: responde 200 siempre para evitar reintentos infinitos.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { monoService, type MonoWebhookPayload } from '@/lib/services/integrations/breb';

export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo (para verificacion de firma si aplica)
    const rawBody = await request.text();

    // Header de firma HMAC-SHA256 (opcional, para verificacion)
    const signature = request.headers.get('X-Signature');

    // Log del payload recibido
    console.log('[BreB Webhook] Payload recibido:', rawBody);
    if (signature) {
      console.log('[BreB Webhook] Firma X-Signature presente');
    }

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

    // Procesar webhook via servicio
    await monoService.processWebhook(connectionId, payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Mono no reintente
    console.error('[BreB Webhook] Error procesando:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
