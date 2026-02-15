/**
 * API Route: Webhook — Status Callback de Twilio
 * POST /api/integrations/twilio/status-callback
 *
 * Twilio envía actualizaciones de estado de cada mensaje enviado.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateTwilioSignature,
  handleStatusCallback,
} from '@/lib/services/integrations/twilio';
import type { TwilioStatusCallback } from '@/lib/services/integrations/twilio';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validar firma en producción
    if (process.env.NODE_ENV === 'production') {
      const signature = request.headers.get('x-twilio-signature') || '';
      const url = `${process.env.TWILIO_WEBHOOK_BASE_URL}/status-callback`;
      const isValid = validateTwilioSignature(signature, url, params);
      if (!isValid) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const callback: TwilioStatusCallback = {
      MessageSid: params.MessageSid || '',
      MessageStatus: params.MessageStatus as TwilioStatusCallback['MessageStatus'],
      AccountSid: params.AccountSid || '',
      From: params.From || '',
      To: params.To || '',
      ErrorCode: params.ErrorCode,
      ErrorMessage: params.ErrorMessage,
    };

    await handleStatusCallback(callback);

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[Webhook] Error procesando status callback:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
