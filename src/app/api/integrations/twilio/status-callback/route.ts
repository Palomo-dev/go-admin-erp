/**
 * API Route: Webhook — Status Callback de Twilio
 * POST /api/integrations/twilio/status-callback
 *
 * Twilio envía actualizaciones de estado de cada mensaje enviado.
 *
 * Seguridad (F0, C12/C13): firma `X-Twilio-Signature` SIEMPRE (dev y prod),
 * token resuelto por `AccountSid` (master o subcuenta), URL reconstruida
 * desde TWILIO_WEBHOOK_BASE_URL. Sin firma/token válido → 403.
 */

import { NextResponse } from 'next/server';
import { handleStatusCallback } from '@/lib/services/integrations/twilio';
import type { TwilioStatusCallback } from '@/lib/services/integrations/twilio';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    ({ params } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Webhook status-callback] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
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
