/**
 * API Route: Webhook — Mensaje entrante de Twilio (SMS/WhatsApp)
 * POST /api/integrations/twilio/incoming-message
 *
 * Twilio envía un POST a esta URL cada vez que un mensaje llega
 * al número de la organización.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateTwilioSignature,
  handleIncomingMessage,
} from '@/lib/services/integrations/twilio';
import type { TwilioIncomingMessage } from '@/lib/services/integrations/twilio';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validar firma de Twilio (seguridad)
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.TWILIO_WEBHOOK_BASE_URL}/incoming-message`;

    if (process.env.NODE_ENV === 'production') {
      const isValid = validateTwilioSignature(signature, url, params);
      if (!isValid) {
        console.warn('[Webhook] Firma de Twilio inválida');
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

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

    // Responder con TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${response}</Message>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[Webhook] Error procesando mensaje entrante:', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }
}
