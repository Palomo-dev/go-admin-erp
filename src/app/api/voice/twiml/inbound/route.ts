import { verifyTwilioWebhook, WebhookError, getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTelephonySettings, accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { resolveInboundTargets } from '@/lib/services/crm/phoneNumberService';
import { buildInboundTwiml, buildHangupTwiml, buildCallbackUrl, xmlResponse, CONSENT_LANGUAGE } from '@/lib/services/crm/twimlBuilders';
import { isBridgeSigningConfigured, signConsentToken, verifyConsentToken } from '@/lib/services/crm/bridgeTokens';
import { recordConsent } from '@/lib/services/crm/consentService';

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
 *
 * Consentimiento (N-4, Ley 1581): la llamada nace SIEMPRE con
 * `consent_given=false`. Con grabación activa, la primera respuesta es
 * `<Say aviso/> + <Redirect …?ct=TOKEN>`: Twilio solo pide ese redirect cuando
 * el aviso ha terminado de sonar. Es esa segunda pasada la que escribe
 * `consent_given=true` y el acta en `call_consents`, y la que devuelve el
 * `<Dial>` con grabación.
 *
 * Ronda 4 (A-1): la prueba de que el aviso sonó ya NO es `?announced=1`. Ese
 * indicador viajaba en la cadena de consulta, que controla quien firma la
 * petición: bastaba con apuntar el VoiceUrl del número a
 * `…/inbound?announced=1` para obtener un TwiML SIN aviso pero CON grabación y
 * dejar escrita un acta de un aviso que nunca se emitió. Un acta fabricable con
 * un cambio de URL no vale como evidencia bajo la Ley 1581 de 2012. Ahora la
 * primera pasada acuña un HMAC ligado al `CallSid` y con caducidad
 * (`signConsentToken`, el mismo secreto y el mismo primitivo que los tokens del
 * bridge de F5) y el consentimiento solo se marca si el token vuelve intacto.
 *
 * DEGRADACIÓN SIN `VOICE_CALLBACK_SECRET` (decisión explícita): sin secreto no
 * se puede acuñar ni verificar el token, así que no hay forma de acreditar el
 * aviso. La regla que no se negocia es «nunca grabar sin acta», no «grabar sin
 * consentimiento»: la llamada SE ATIENDE con normalidad y simplemente NO se
 * graba (`recording_enabled=false` en la fila, sin `record=` en el `<Dial>` y
 * sin fila en `call_consents`). Se registra un aviso en el log para que el
 * dueño sepa que la grabación de esa organización está inhibida por
 * configuración, no por preferencia.
 *
 * Ronda 5 (V-3): el acta la escribe `recordConsent` (único escritor de
 * `call_consents`, idempotente sobre el índice único). Si NO se puede escribir,
 * se falla CERRADO igual que `ai-agent`: el `<Dial>` sale sin `record=` y la
 * fila pasa a `recording_enabled=false`. Antes, con el INSERT fallando, se
 * devolvía igualmente el `<Dial>` con grabación.
 *
 * Ronda 6 (N-6): con fila `calls` ya creada, `record=` se decide por
 * `recording_enabled` de ESA fila, no por `comm_settings`: tras una caída que
 * dejó la fila en `false`, el reintento del mismo token no graba.
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
  /**
   * `true` SOLO si vuelve un token que acuñó este servidor para ESTE `CallSid`
   * en la pasada del aviso. Un `?announced=1` de la URL ya no acredita nada.
   */
  const announced = verifyConsentToken(callSid, new URL(request.url).searchParams.get('ct'));

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
    // Sin secreto de firma no hay acta posible → no se graba (ver cabecera).
    // Sin `CallSid` el token no se puede ligar a nada: `verifyConsentToken`
    // devolvería `false` siempre y la segunda pasada volvería a emitir el
    // aviso en bucle. Se trata como "no se puede acreditar" → no se graba.
    const canProveConsent = isBridgeSigningConfigured() && callSid !== '';
    const recordingEnabled = settings.voice_recording_enabled === true && canProveConsent;
    if (settings.voice_recording_enabled === true && !canProveConsent) {
      console.warn('[TwiML Inbound] grabación inhibida: no se puede acreditar el aviso (Ley 1581)', {
        orgId,
        faltaSecreto: !isBridgeSigningConfigured(),
        faltaCallSid: callSid === '',
      });
    }

    // Idempotencia por CallSid
    const { data: existing } = await sb.from('calls').select('id, recording_enabled').eq('organization_id', orgId).eq('provider_call_sid', callSid).maybeSingle();
    const existingRow = existing as { id: string; recording_enabled: boolean | null } | null;
    let callId = existingRow?.id ?? null;
    /**
     * Lo que de verdad va a llevar el TwiML: cae a `false` si el acta falla.
     * Con fila YA creada manda la fila (N-6, ronda 6): si una pasada anterior
     * la dejó en `recording_enabled=false` porque el acta no se pudo escribir,
     * el reintento de Twilio con el mismo token no debe grabar aunque la BD ya
     * responda. Coherencia fila ↔ TwiML: una sola fuente de verdad.
     */
    let recordNow = existingRow ? existingRow.recording_enabled === true && canProveConsent : recordingEnabled;

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
          // N-4: el aviso todavía no ha sonado. Lo pone en `true` la segunda
          // pasada (`?announced=1`), que es la prueba de que sí se reprodujo.
          consent_given: false,
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
    }

    // F-3 (ronda 7, gemelo de N-2): sin agentes conectados `buildInboundTwiml`
    // responde `<Hangup/>` sin `<Dial>`, así que NO va a haber grabación. Un
    // acta escrita en ese camino sería «acta sin grabación» que ningún callback
    // corregiría (Twilio no envía `absent` de algo que nunca arrancó). No se
    // escribe; no se retira una preexistente porque un reintento de Twilio del
    // mismo token tras un `<Dial record=>` real sí pudo dejar grabación.
    const willDial = targets.identities.length > 0;
    if (recordNow && !willDial) {
      console.warn('[TwiML Inbound] sin agentes conectados: <Hangup/> sin grabación, no se escribe acta', { orgId, callId });
      recordNow = false;
    }

    // El aviso YA sonó: ahora sí hay acta que escribir (una sola vez, por el
    // único escritor). Sin acta no hay `record=`: nunca al revés.
    if (announced && recordNow && callId) {
      try {
        await recordConsent(
          orgId,
          {
            callId,
            consentType: 'recording',
            consentGiven: true,
            consentMessage: settings.voice_consent_message,
            method: 'voice_announcement',
            locale: CONSENT_LANGUAGE,
          },
          sb
        );
      } catch (err) {
        console.error('[TwiML Inbound] sin acta no se graba:', err instanceof Error ? err.message : err, { orgId });
        recordNow = false;
        await sb.from('calls').update({ recording_enabled: false }).eq('id', callId).eq('organization_id', orgId);
      }
    }

    return xmlResponse(
      buildInboundTwiml({
        origin,
        callId,
        from,
        calledNumber: to,
        identities: targets.identities,
        recordingEnabled: recordNow,
        consentMessage: settings.voice_consent_message,
        ringTimeoutSeconds: settings.voice_ring_timeout_seconds,
        announced,
        consentRedirectUrl:
          announced || !recordNow
            ? null
            : buildCallbackUrl(origin, '/api/voice/twiml/inbound', { ct: signConsentToken(callSid) }),
      })
    );
  } catch (error: unknown) {
    console.error('[TwiML Inbound] error:', error instanceof Error ? error.message : error);
    return xmlResponse(buildHangupTwiml('Ha ocurrido un error. Por favor intente más tarde.'));
  }
}
