import { NextRequest, NextResponse } from 'next/server';
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
  const expectedToken =
    channel?.credentials.verifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || 'go_admin_meta_verify';

  if (mode === 'subscribe' && token === expectedToken) {
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

    // Verificar firma si hay app_secret configurado
    if (channel.credentials.appSecret) {
      const valid = metaMessagingService.verifySignature(rawBody, signature, channel.credentials.appSecret);
      if (!valid) {
        return NextResponse.json({ received: true, error: 'Firma inválida' }, { status: 200 });
      }
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
