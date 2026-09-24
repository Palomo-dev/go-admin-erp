// ============================================================
// POST /api/integrations/bancolombia/webhook
// Recibe notificaciones de Bancolombia (callback del proveedor).
// Endpoint publico invocado por Bancolombia; la unica puerta es la firma.
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §2.2 «Webhooks de cobro»): antes
// aceptaba un JSON PLANO sin verificar nada, y un JWT HS256 firmado con clave
// vacia pasaba cuando la conexion no tenia secreto. Cualquiera marcaba una
// sesion QR como pagada. Ahora es FAIL-CLOSED: solo JWT, con el secreto de la
// conexion presente y firma valida; si no → 401 sin procesar. El body ya no va
// a los logs.
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
    // Leer payload crudo (debe ser un JWT firmado)
    const rawBody = await request.text();

    // Extraer connectionId de query params
    const url = new URL(request.url);
    const connectionId = url.searchParams.get('connectionId') ?? undefined;

    // Un JSON plano no trae firma: se rechaza (antes se procesaba sin verificar).
    if (!connectionId || !isJwt(rawBody)) {
      console.warn('[Bancolombia Webhook] rechazado: falta connectionId o el body no es un JWT firmado (fail-closed)');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }

    // Obtener client_secret para verificar firma
    const supabase = getSupabaseAdmin();
    const { data: creds, error: credsError } = await supabase
      .from('integration_credentials')
      .select('secret_ref')
      .eq('connection_id', connectionId)
      .eq('status', 'active')
      .single();

    let clientSecret = '';
    if (!credsError && creds?.secret_ref) {
      try {
        const parsed = JSON.parse(creds.secret_ref);
        clientSecret = parsed.client_secret || parsed.clientSecret || '';
      } catch {
        clientSecret = creds.secret_ref;
      }
    }

    // Sin secreto, un HS256 firmado con clave vacia pasaria: se rechaza antes.
    if (!clientSecret) {
      console.warn('[Bancolombia Webhook] rechazado: la conexion no tiene secreto activo (fail-closed)');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }

    if (!bancolombiaService.verifyJwtNotification(rawBody, clientSecret)) {
      console.error('[Bancolombia Webhook] JWT invalido o firma no verificada');
      return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
    }
    const decoded = bancolombiaService.decodeJwtPayload(rawBody);
    if (!decoded) {
      console.error('[Bancolombia Webhook] No se pudo decodificar el JWT');
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    const payload: BancolombiaWebhookPayload = decoded;

    // Procesar webhook via servicio
    await bancolombiaService.processWebhook(connectionId, payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Bancolombia no reintente
    console.error('[Bancolombia Webhook] Error procesando:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
