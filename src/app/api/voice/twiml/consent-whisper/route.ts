import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTelephonySettings, accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { buildConsentTwiml, buildHangupTwiml, CONSENT_LANGUAGE, EMPTY_TWIML, xmlResponse } from '@/lib/services/crm/twimlBuilders';
import { recordConsent } from '@/lib/services/crm/consentService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/twiml/consent-whisper?callId=… — `url` del `<Number>` (FASE-03 §4.5.2).
 *
 * Twilio lo invoca cuando el CLIENTE contesta y antes del bridge: reproduce el
 * aviso de grabación al cliente (queda dentro de la grabación dual). La firma
 * de Twilio cubre la query (`callId`), por eso no hace falta un HMAC extra.
 *
 * Ronda 5 (V-4/V-5): ESTE es el sitio que escribe el acta del saliente por
 * navegador y del bridge móvil, porque es el único momento en que se sabe que
 * el aviso suena. Antes el acta la escribían `twiml/outbound` e
 * `initiateBridge` AL MARCAR, con `announced_at` = DEFAULT now(): una llamada
 * que nunca contestaban dejaba un acta fechada como si el aviso hubiera
 * sonado; y este whisper solo ponía `consent_given=true` sin acta propia.
 *
 * Contrato:
 * - La fila `calls` debe ser de la org del firmante (`accountSidMatchesOrg`).
 * - Si la fila NO se graba (`recording_enabled=false`), no hay nada que avisar
 *   ni que registrar: `<Response/>` vacío y el bridge sigue.
 * - Con grabación: `recordConsent` (acta + `consent_given`, idempotente frente
 *   a reintentos: un segundo whisper no duplica ni mueve `announced_at`) y
 *   DESPUÉS el `<Say>`. Si el acta no se puede escribir se responde `<Hangup/>`
 *   (único verbo de "declinar" que Twilio admite en el TwiML de `<Number url>`):
 *   el `<Dial>` padre ya lleva `record=`, así que dejar entrar al cliente sería
 *   grabar sin acta. Nunca al revés.
 * - El texto es el `voice_consent_message` vigente de la org en el momento del
 *   aviso y queda copiado en `recorded_announcement_text`.
 */
export async function POST(request: Request) {
  let accountSid: string;
  try {
    ({ accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) return new Response('Forbidden', { status: err.statusCode });
    throw err;
  }

  const callId = new URL(request.url).searchParams.get('callId') || '';
  const sb = getServiceClient();
  const { data: call } = await sb.from('calls').select('id, organization_id, recording_enabled').eq('id', callId).maybeSingle();
  const row = call as { id: string; organization_id: number; recording_enabled: boolean | null } | null;
  if (!row) return xmlResponse(EMPTY_TWIML);
  // Aislamiento multi-tenant (M1): esta ruta escribe el acta de la fila
  // encontrada por `callId`, así que el firmante debe ser la cuenta de esa org.
  if (!(await accountSidMatchesOrg(row.organization_id, accountSid, sb))) {
    console.warn('[consent-whisper] AccountSid ajeno a la org de la llamada', { org: row.organization_id });
    return new Response('Forbidden', { status: 403 });
  }

  if (row.recording_enabled !== true) return xmlResponse(EMPTY_TWIML);

  const settings = await getTelephonySettings(row.organization_id, sb);
  const text = settings.voice_consent_message;

  try {
    await recordConsent(
      row.organization_id,
      {
        callId: row.id,
        consentType: 'recording',
        consentGiven: true,
        consentMessage: text,
        method: 'voice_announcement',
        locale: CONSENT_LANGUAGE,
      },
      sb
    );
  } catch (err) {
    console.error('[consent-whisper] sin acta no se conecta la llamada grabada:', err instanceof Error ? err.message : err, { org: row.organization_id });
    return xmlResponse(buildHangupTwiml());
  }

  return xmlResponse(buildConsentTwiml(text));
}
