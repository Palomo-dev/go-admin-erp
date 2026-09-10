import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTelephonySettings, accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { buildConsentTwiml, xmlResponse } from '@/lib/services/crm/twimlBuilders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/twiml/consent-whisper?callId=… — `url` del `<Number>` (FASE-03 §4.5.2).
 *
 * Twilio lo invoca cuando el CLIENTE contesta y antes del bridge: reproduce el
 * aviso de grabación al cliente (queda dentro de la grabación dual). La firma
 * de Twilio cubre la query (`callId`), por eso no hace falta un HMAC extra.
 * El texto sale de `call_consents.recorded_announcement_text` (texto exacto del
 * momento de la llamada; no se reescribe si el admin cambia el mensaje).
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
  const { data: call } = await sb.from('calls').select('id, organization_id').eq('id', callId).maybeSingle();
  const row = call as { id: string; organization_id: number } | null;
  if (!row) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>');
  // Aislamiento multi-tenant (M1): esta ruta escribe `consent_given` en la fila
  // encontrada por `callId`, así que el firmante debe ser la cuenta de esa org.
  if (!(await accountSidMatchesOrg(row.organization_id, accountSid, sb))) {
    console.warn('[consent-whisper] AccountSid ajeno a la org de la llamada', { org: row.organization_id });
    return new Response('Forbidden', { status: 403 });
  }

  const { data: consent } = await sb
    .from('call_consents')
    .select('recorded_announcement_text')
    .eq('organization_id', row.organization_id)
    .eq('call_id', row.id)
    .order('announced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let text = (consent as { recorded_announcement_text?: string | null } | null)?.recorded_announcement_text || '';
  if (!text) {
    const settings = await getTelephonySettings(row.organization_id, sb);
    text = settings.voice_consent_message;
  }

  await sb.from('calls').update({ consent_given: true }).eq('id', row.id).eq('organization_id', row.organization_id);
  return xmlResponse(buildConsentTwiml(text));
}
