import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/security/webhookSignatures';
import { metaMessagingService } from '@/lib/services/integrations/meta-messaging/metaMessagingService';

/**
 * Webhook de Instagram Messaging por canal.
 * URL: /api/webhooks/instagram/{channelId}
 *
 * GET  → verificación del webhook (Meta envía hub.challenge).
 * POST → recepción de mensajes directos entrantes (objeto "instagram").
 */

// GET: verificación del webhook
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const channel = await metaMessagingService.getChannelInfo(channelId);
  // GO-sec (2026-09-24): sin token por defecto. Antes, sin token del canal ni
  // META_WEBHOOK_VERIFY_TOKEN, valía el literal público 'go_admin_meta_verify'.
  const expectedToken = channel?.credentials.verifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || '';

  if (mode === 'subscribe' && expectedToken && token && safeEqual(token, expectedToken)) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST: recepción de eventos
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';

    const channel = await metaMessagingService.getChannelInfo(channelId);
    if (!channel) {
      return NextResponse.json({ received: true, error: 'Canal no encontrado' }, { status: 200 });
    }

    // Firma X-Hub-Signature-256 OBLIGATORIA (GO-sec 2026-09-24). Antes solo
    // se verificaba si el canal tenía app_secret: sin él, cualquiera inyectaba
    // mensajes en las conversaciones de la organización del canal. Sin secreto
    // o con firma mala → 401 y no se procesa nada.
    const appSecret = channel.credentials.appSecret;
    if (!appSecret || !signature || !metaMessagingService.verifySignature(rawBody, signature, appSecret)) {
      console.warn('[Instagram Webhook] firma ausente o inválida → 401', { channelId });
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    if (payload.object !== 'instagram') {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    // Procesar de forma asíncrona para responder rápido a Meta (< 20s)
    metaMessagingService.processWebhookPayload('instagram', channel, payload).catch((error) => {
      console.error('[Instagram Webhook] Error procesando payload:', error);
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[Instagram Webhook] Error parseando request:', error);
    return NextResponse.json({ received: true, error: 'Parse error' }, { status: 200 });
  }
}
