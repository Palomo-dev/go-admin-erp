/**
 * API Route: Webhook — Mensaje entrante de Twilio (SMS/WhatsApp)
 * POST /api/integrations/twilio/incoming-message
 *
 * Seguridad (F0, C7/C12): firma verificada SIEMPRE con el token de la
 * (sub)cuenta (AccountSid); TwiML escapado; opt-out (STOP/BAJA/CANCELAR/NO MAS)
 * gestionado en `handleIncomingMessage` → contact_consents + customers.metadata.
 */

import { NextResponse } from 'next/server';
import { handleIncomingMessage } from '@/lib/services/integrations/twilio';
import type { TwilioIncomingMessage } from '@/lib/services/integrations/twilio';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';

export const runtime = 'nodejs';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    ({ params } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Webhook incoming-message] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    const message: TwilioIncomingMessage = {
      MessageSid: params.MessageSid || '',
      AccountSid: params.AccountSid || '',
      From: params.From || '',
      To: params.To || '',
      Body: params.Body || '',
      NumMedia: params.NumMedia || '0',
      MediaUrl0: params.MediaUrl0,
      MediaContentType0: params.MediaContentType0,
    };

    const { response } = await handleIncomingMessage(message);

    if (!response) {
      return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // Responder con TwiML (contenido escapado)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(response)}</Message>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[Webhook] Error procesando mensaje entrante:', error);
    return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }
}
