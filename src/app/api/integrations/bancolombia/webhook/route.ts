// ============================================================
// POST /api/integrations/bancolombia/webhook
// Recibe notificaciones de Bancolombia (callback del proveedor).
// Sin autenticacion: es un endpoint publico invocado por Bancolombia.
// IMPORTANTE: responde 200 siempre en < 3 segundos para evitar reintentos.
// El payload puede ser un JWT firmado o un JSON plano.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  bancolombiaService,
  type BancolombiaWebhookPayload,
} from '@/lib/services/integrations/bancolombia';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Determina si el payload crudo es un JWT (tres segmentos separados por punto). */
function isJwt(raw: string): boolean {
  const parts = raw.trim().split('.');
  return parts.length === 3;
}

export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo (puede ser JWT o JSON)
    const rawBody = await request.text();

    // Log del payload recibido
    console.log('[Bancolombia Webhook] Payload recibido:', rawBody);

    // Extraer connectionId de query params
    const url = new URL(request.url);
    const connectionId = url.searchParams.get('connectionId') ?? undefined;

    if (!connectionId) {
      console.error(
        '[Bancolombia Webhook] No se encontro connectionId en query params'
      );
      // Responder 200 igualmente para evitar reintentos
      return NextResponse.json({ received: true }, { status: 200 });
    }

    let payload: BancolombiaWebhookPayload;

    // Si es JWT, verificar firma y decodificar; si es JSON, parsear directo
    if (isJwt(rawBody)) {
      // Obtener client_secret para verificar firma
      const supabase = getSupabaseAdmin();
      const { data: creds } = await supabase
        .from('integration_credentials')
        .select('secret_ref')
        .eq('connection_id', connectionId)
        .eq('status', 'active')
        .single();

      let clientSecret = '';
      if (creds?.secret_ref) {
        try {
          const parsed = JSON.parse(creds.secret_ref);
          clientSecret = parsed.client_secret || parsed.clientSecret || '';
        } catch {
          clientSecret = creds.secret_ref;
        }
      }

      const isValid = bancolombiaService.verifyJwtNotification(rawBody, clientSecret);
      if (!isValid) {
        console.error('[Bancolombia Webhook] JWT invalido o firma no verificada');
        return NextResponse.json({ received: true }, { status: 200 });
      }
      const decoded = bancolombiaService.decodeJwtPayload(rawBody);
      if (!decoded) {
        console.error('[Bancolombia Webhook] No se pudo decodificar el JWT');
        return NextResponse.json({ received: true }, { status: 200 });
      }
      payload = decoded;
    } else {
      payload = JSON.parse(rawBody) as BancolombiaWebhookPayload;
    }

    // Procesar webhook via servicio
    await bancolombiaService.processWebhook(connectionId, payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Bancolombia no reintente
    console.error('[Bancolombia Webhook] Error procesando:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
