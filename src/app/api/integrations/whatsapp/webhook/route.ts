import { NextRequest, NextResponse } from 'next/server';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';
import type { WhatsAppWebhookPayload } from '@/lib/services/integrations/whatsapp';
import { verifyMetaSignature } from '@/lib/security/webhookSignatures';

export const runtime = 'nodejs';

// GET: Verificación del webhook (Meta envía challenge)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN no configurado');
    return NextResponse.json({ error: 'Verification not configured' }, { status: 403 });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verificación exitosa');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verificación fallida', { mode });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * Extrae los `phone_number_id` presentes en el payload (uno por entry/change).
 */
function extractPhoneNumberIds(payload: WhatsAppWebhookPayload): string[] {
  const ids = new Set<string>();
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const id = (change as { value?: { metadata?: { phone_number_id?: string } } }).value?.metadata?.phone_number_id;
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Resuelve el app_secret para verificar la firma:
 * 1. `channel_credentials.credentials.app_secret` del canal (por phone_number_id)
 * 2. `META_APP_SECRET` global (app de la plataforma / Embedded Signup)
 */
async function resolveAppSecret(phoneNumberId: string | null): Promise<string | null> {
  if (phoneNumberId) {
    const channel = await whatsappCloudService.findChannelByPhoneNumberId(phoneNumberId);
    if (channel) {
      const creds = await whatsappCloudService.getCredentialsByChannelId(channel.channelId);
      if (creds?.appSecret) return creds.appSecret;
    }
  }
  return process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || null;
}

// POST: Recibir mensajes y status updates
// F0 (C3 msg): firma X-Hub-Signature-256 verificada SIEMPRE (fail-closed) sobre el raw body.
export async function POST(request: NextRequest) {
  let rawBody: string;
  let payload: WhatsAppWebhookPayload;
  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error('[WhatsApp Webhook] Error parseando request:', error);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const signature = request.headers.get('x-hub-signature-256');

  // Verificar firma antes de procesar nada
  const phoneNumberIds = extractPhoneNumberIds(payload);
  const appSecret = await resolveAppSecret(phoneNumberIds[0] ?? null);

  if (!appSecret) {
    console.error('[WhatsApp Webhook] Sin app_secret para verificar la firma (canal/META_APP_SECRET). Rechazado.');
    return NextResponse.json({ error: 'signature_secret_missing' }, { status: 403 });
  }

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    console.warn('[WhatsApp Webhook] Firma inválida. Rechazado.', { phoneNumberIds });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 });
  }

  // Verificar que es un evento de WhatsApp Business Account
  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  // F16 r2 (tester r1 · fallo 1): el procesamiento se ESPERA y sus fallos se
  // propagan. Antes iba en fire-and-forget con un `.catch(console.error)`, así
  // que un inbound que no se podía guardar (trigger de identidades) se perdía
  // en silencio y Meta nunca lo reintentaba. Son 1-3 INSERT por webhook, muy
  // por debajo del margen de Meta.
  try {
    await whatsappCloudService.processWebhookPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[WhatsApp Webhook] Error procesando payload:', message);
    return NextResponse.json({ received: false, error: message, code: (error as { code?: string })?.code ?? 'PROCESSING_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
