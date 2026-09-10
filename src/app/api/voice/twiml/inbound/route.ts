import { verifyTwilioWebhook, WebhookError, getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTelephonySettings, accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { resolveInboundTargets } from '@/lib/services/crm/phoneNumberService';
import { buildInboundTwiml, buildHangupTwiml, xmlResponse } from '@/lib/services/crm/twimlBuilders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/twiml/inbound — VoiceUrl de los números de la org (FASE-03 §2.3, §4.5.4).
 *
 * ÚNICA ruta de entrantes (el handler legacy `/api/integrations/twilio/voice/incoming`
 * delega aquí). Resuelve la org por `To` (`phone_numbers.e164` → `comm_settings.phone_number`,
 * sin fallback "primera org", C11), crea `calls` (mode 'inbound', direction 'inbound',
 * status 'ringing', `customer_id` por `customers.phone`), reproduce el aviso de
 * consentimiento si hay grabación y hace `<Dial record… action=dial-complete>` a los
 * `<Client>` con identity real `u_{uuid}_o_{org}` (C21). Sin agentes → mensaje + `<Hangup/>`.
 * El buzón/agente IA sin respuesta lo añade F6.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[TwiML Inbound] Rechazado:', err.code);
      return new Response('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  const origin = getTwilioWebhookOrigin();
  const callSid = params.CallSid || '';
  const from = params.From || '';
  const to = params.To || '';

  try {
    const sb = getServiceClient();
    const targets = await resolveInboundTargets(to, sb);
    if (!targets) {
      console.warn('[TwiML Inbound] Número no configurado:', to);
      return xmlResponse(buildHangupTwiml('Lo sentimos, este número no está configurado. Adiós.'));
    }
    const orgId = targets.organizationId;
    // Aislamiento multi-tenant (M1): el número resuelve la org, pero quien firma
    // debe ser la cuenta Twilio de esa org (o la master de la plataforma).
    if (!(await accountSidMatchesOrg(orgId, accountSid, sb))) {
      console.warn('[TwiML Inbound] AccountSid ajeno a la org del número', { orgId });
      return new Response('Forbidden', { status: 403 });
    }
    const settings = await getTelephonySettings(orgId, sb);
    const recordingEnabled = settings.voice_recording_enabled === true;

    // Idempotencia por CallSid
    const { data: existing } = await sb.from('calls').select('id').eq('organization_id', orgId).eq('provider_call_sid', callSid).maybeSingle();
    let callId = (existing as { id: string } | null)?.id ?? null;

    if (!callId) {
      const { data: customer } = from
        ? await sb.from('customers').select('id').eq('organization_id', orgId).eq('phone', from).limit(1).maybeSingle()
        : { data: null };
      const { data: created, error } = await sb
        .from('calls')
        .insert({
          organization_id: orgId,
          provider: 'twilio',
          provider_call_sid: callSid,
          direction: 'inbound',
          mode: 'inbound',
          from_number: from || 'unknown',
          to_number: to,
          customer_id: (customer as { id: string } | null)?.id ?? null,
          user_id: targets.userIds[0] ?? null,
          status: 'ringing',
          started_at: new Date().toISOString(),
          recording_enabled: recordingEnabled,
          consent_given: recordingEnabled,
          cost_currency: 'USD',
          duration_source: 'provider',
          metadata: {
            caller_name: params.CallerName ?? null,
            from_city: params.FromCity ?? null,
            from_country: params.FromCountry ?? null,
            phone_number_id: targets.phoneNumberId,
            ring_targets: targets.userIds,
          },
        })
        .select('id')
        .single();
      if (error) throw new Error(`calls insert: ${error.message}`);
      callId = (created as { id: string }).id;

      if (recordingEnabled) {
        await sb.from('call_consents').insert({
          organization_id: orgId,
          call_id: callId,
          consent_type: 'recording',
          method: 'voice_announcement',
          locale: 'es-MX',
          recorded_announcement_text: settings.voice_consent_message,
        });
      }
    }

    return xmlResponse(
      buildInboundTwiml({
        origin,
        callId,
        from,
        calledNumber: to,
        identities: targets.identities,
        recordingEnabled,
        consentMessage: settings.voice_consent_message,
        ringTimeoutSeconds: settings.voice_ring_timeout_seconds,
      })
    );
  } catch (error: unknown) {
    console.error('[TwiML Inbound] error:', error instanceof Error ? error.message : error);
    return xmlResponse(buildHangupTwiml('Ha ocurrido un error. Por favor intente más tarde.'));
  }
}
