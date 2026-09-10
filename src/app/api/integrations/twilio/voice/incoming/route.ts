/**
 * API Route (LEGACY): POST /api/integrations/twilio/voice/incoming
 *
 * F3: `/api/voice/twiml/inbound` es la ÚNICA ruta de llamadas entrantes.
 * Este handler valida la firma de Twilio (fail-closed) sobre ESTE pathname y
 * delega en el handler canónico, en lugar de responder 308: un redirect
 * cambiaría la URL sobre la que Twilio calculó `X-Twilio-Signature` y obligaría
 * a un segundo salto de red por cada llamada entrante. Como la firma se valida
 * contra el pathname original, la delegación funciona para los números que aún
 * apunten aquí.
 *
 * Pendiente F6: borrar esta ruta cuando ningún número de Twilio la use
 * (verificar con `incomingPhoneNumbers.list()` → `voiceUrl`). El flujo de
 * ConversationRelay para entrantes lo añade F6 desde `/api/voice/twiml/inbound`
 * (cuando `comm_settings.voice_agent_enabled`).
 */

import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { POST as inboundPost } from '@/app/api/voice/twiml/inbound/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    ({ rawBody } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Twilio Voice Incoming (legacy)] Rechazado:', err.code);
      return new Response('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  // El body ya se consumió al verificar: se reconstruye la petición con la
  // MISMA url y headers para que el handler canónico revalide la firma.
  const delegated = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: rawBody,
  });
  return inboundPost(delegated);
}
