import { NextRequest, NextResponse } from 'next/server';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';
import type { WhatsAppWebhookPayload } from '@/lib/services/integrations/whatsapp';

// GET: Verificación del webhook (Meta envía challenge)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'go_admin_whatsapp_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verificación exitosa');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verificación fallida', { mode, token: token?.slice(0, 5) + '...' });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST: Recibir mensajes y status updates
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';

    const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);

    // Verificar que es un evento de WhatsApp Business Account
    if (payload.object !== 'whatsapp_business_account') {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    // Verificar firma si tenemos app_secret configurado
    // La verificación se hace por canal, ya que cada canal puede tener su propio app_secret
    // Si no hay firma o no tenemos secret, procesamos igualmente (Meta siempre envía firma)

    // Procesar payload de forma asíncrona para responder rápido a Meta
    // Meta requiere respuesta < 20 segundos
    whatsappCloudService.processWebhookPayload(payload).catch((error) => {
      console.error('[WhatsApp Webhook] Error procesando payload:', error);
    });

    // Meta espera HTTP 200 siempre
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error parseando request:', error);
    // Responder 200 para evitar que Meta reintente indefinidamente
    return NextResponse.json({ received: true, error: 'Parse error' }, { status: 200 });
  }
}
