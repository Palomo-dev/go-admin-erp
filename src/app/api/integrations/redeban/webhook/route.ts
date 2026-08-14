// ============================================================
// POST /api/integrations/redeban/webhook
// Recibe notificaciones de Redeban (callback del proveedor).
// Sin autenticacion: es un endpoint publico invocado por Redeban.
// IMPORTANTE: responde 200 siempre para evitar reintentos infinitos.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { redebanService } from '@/lib/services/integrations/redeban';
import type { RedebanWebhookPayload } from '@/lib/services/integrations/redeban/redebanTypes';

export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo y parsear
    const rawBody = await request.text();
    const payload: RedebanWebhookPayload = JSON.parse(rawBody);

    // Log del payload recibido
    console.log('[Redeban Webhook] Payload recibido:', payload);

    // Extraer connectionId del payload o de query params
    const url = new URL(request.url);
    const connectionId =
      (payload as { connectionId?: string }).connectionId ??
      url.searchParams.get('connectionId') ??
      undefined;

    if (!connectionId) {
      console.error('[Redeban Webhook] No se encontro connectionId en payload ni query params');
      // Responder 200 igualmente para evitar reintentos
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Procesar webhook via servicio
    await redebanService.processWebhook(connectionId, payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Redeban no reintente
    console.error('[Redeban Webhook] Error procesando:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
