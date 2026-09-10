import { verifyTwilioWebhook, WebhookError, getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { resolveOrgFromExternal, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { parseVoiceIdentity, isClientFrom } from '@/lib/services/crm/voiceTokenService';
import { getTelephonySettings, pickCallerId, isActiveMember, filterOrgOwnedRefs, accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { buildOutboundBrowserTwiml, buildHangupTwiml, xmlResponse, escapeXml } from '@/lib/services/crm/twimlBuilders';
import { reserveVoiceMinutes } from '@/lib/services/crm/callCreditsService';
import { normalizeDialableE164 } from '@/lib/services/integrations/twilio/twilioConfig';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Susurro al agente cuando la grabación está activa (mismo texto en reintentos). */
const AGENT_RECORDING_PROMPT = 'Conectando. Esta llamada se grabará.';

/**
 * POST /api/voice/twiml/outbound — VoiceUrl del TwiML App (FASE-03 §4.3).
 *
 * Rama A (client-originated, `From=client:u_{uuid}_o_{org}`): resuelve la org por
 * la identity (C10: la fila `calls` se crea AQUÍ; el browser ya no hace POST
 * /api/voice/call), verifica membresía, reserva 1 minuto de créditos
 * (`deduct_comm_credits`), inserta `calls` (mode browser, dialing) y
 * `call_consents` si hay grabación, y responde el TwiML de §4.5.1 (el
 * consentimiento lo oye el cliente en `<Number url=consent-whisper>`).
 *
 * Rama B (REST-originated, F5/F6: `From` = número): comportamiento previo,
 * resolviendo la org por `CallSid` en `calls`.
 *
 * Seguridad: firma Twilio fail-closed (SEC) — el token se resuelve por AccountSid.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[TwiML Outbound] Rechazado:', err.code);
      return new Response('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  const origin = getTwilioWebhookOrigin();
  const callSid = params.CallSid || '';
  const from = params.From || '';
  const rawTo = params.To || '';

  try {
    if (isClientFrom(from)) {
      return await handleClientOriginated({ params, accountSid, origin, callSid, from, rawTo });
    }
    return await handleRestOriginated({ params, origin, callSid, rawTo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[TwiML Outbound] error:', message);
    return xmlResponse(buildHangupTwiml('Ha ocurrido un error. Por favor intente más tarde.'), 200);
  }
}

async function handleClientOriginated(input: {
  params: Record<string, string>;
  accountSid: string;
  origin: string;
  callSid: string;
  from: string;
  rawTo: string;
}): Promise<Response> {
  const { params, accountSid, origin, callSid, from, rawTo } = input;
  const identity = parseVoiceIdentity(from);
  if (!identity) {
    console.warn('[TwiML Outbound] identity inválida:', from);
    return xmlResponse(buildHangupTwiml('Identidad no válida.'));
  }
  const { userId, orgId } = identity;
  const sb = getServiceClient();

  if (!(await isActiveMember(orgId, userId, sb))) {
    console.warn('[TwiML Outbound] usuario sin membresía activa', { orgId });
    return xmlResponse(buildHangupTwiml('No tiene permisos para llamar desde esta organización.'));
  }

  // Aislamiento multi-tenant (M1 / A-3): quien firma debe ser la cuenta Twilio
  // de ESTA organización (su subcuenta, o la master de la plataforma).
  //
  // Ronda 4: aquí había una copia MÁS DÉBIL de esa comprobación. Empezaba por
  // `if (settings.twilio_subaccount_sid && …)`, así que una organización SIN
  // subcuenta —hoy las 83— se saltaba el bloque entero y aceptaba CUALQUIER
  // AccountSid resoluble: la subcuenta de otro cliente podía marcar con la
  // identity de esta org. Se sustituye por la misma función que usan las otras
  // cinco rutas de F3, que sí falla cerrado cuando no hay subcuenta.
  if (!(await accountSidMatchesOrg(orgId, accountSid, sb))) {
    console.warn('[TwiML Outbound] AccountSid ajeno a la org de la identity', { orgId });
    return xmlResponse(buildHangupTwiml('Cuenta de telefonía no válida.'));
  }

  const settings = await getTelephonySettings(orgId, sb);

  const to = normalizeTo(rawTo);
  if (!to) return xmlResponse(buildHangupTwiml('El número de destino no es válido.'));

  // Idempotencia: reintento de Twilio con el mismo CallSid → mismo TwiML sin duplicar
  const { data: existing } = await sb
    .from('calls')
    .select('id, recording_enabled, from_number, to_number')
    .eq('organization_id', orgId)
    .eq('provider_call_sid', callSid)
    .maybeSingle();
  if (existing) {
    const ex = existing as { id: string; recording_enabled: boolean; from_number: string; to_number: string };
    return xmlResponse(
      buildOutboundBrowserTwiml({
        origin,
        callId: ex.id,
        to: ex.to_number,
        callerId: ex.from_number,
        recordingEnabled: ex.recording_enabled,
        ringTimeoutSeconds: settings.voice_ring_timeout_seconds,
        // Mismo TwiML byte a byte que la primera respuesta (reintento de Twilio).
        agentPrompt: ex.recording_enabled ? AGENT_RECORDING_PROMPT : null,
      })
    );
  }

  const { e164: callerId, phoneNumberId, source: callerIdSource } = await pickCallerId(orgId, settings, sb);
  if (!callerId) {
    return xmlResponse(buildHangupTwiml('La organización no tiene un número de salida configurado.'));
  }
  // M2: el número global de la plataforma NO es de esta organización. Marcar
  // desde él mezcla identidades entre clientes; se falla explícitamente salvo
  // que se habilite a propósito (desarrollo).
  if (callerIdSource === 'platform' && process.env.VOICE_ALLOW_PLATFORM_CALLER_ID !== 'true') {
    console.warn('[TwiML Outbound] sin caller id propio de la org', { orgId });
    return xmlResponse(
      buildHangupTwiml('La organización no tiene un número de salida configurado. Configúralo en Configuración, CRM, Telefonía.')
    );
  }

  // A2: los ids llegan del navegador; solo se persisten si son de ESTA org.
  const refs = await filterOrgOwnedRefs(
    orgId,
    { customerId: uuidOrNull(params.customerId), opportunityId: uuidOrNull(params.opportunityId) },
    sb
  );
  const { customerId, opportunityId } = refs;
  if (refs.rejected.length) console.warn('[TwiML Outbound] ids de otra organización descartados', { orgId, rejected: refs.rejected.length });
  const recordingEnabled = settings.voice_recording_enabled === true;

  // Créditos: reserva de 1 minuto antes de marcar (D6). NULL en BD = ilimitado → true.
  const hasCredits = await reserveVoiceMinutes(orgId, 1, sb);
  if (!hasCredits) {
    await insertCall(sb, {
      orgId, callSid, userId, callerId, to, customerId, opportunityId, recordingEnabled,
      status: 'failed',
      metadata: { identity: from, reason: 'no_credits', caller_id_id: phoneNumberId, caller_id_source: callerIdSource, rejected_refs: refs.rejected },
    }).catch(() => null);
    return xmlResponse(buildHangupTwiml('Su organización no tiene minutos de voz disponibles.'));
  }

  const callId = await insertCall(sb, {
    orgId, callSid, userId, callerId, to, customerId, opportunityId, recordingEnabled,
    status: 'dialing',
    metadata: {
      identity: from,
      caller_id_id: phoneNumberId,
      caller_id_source: callerIdSource,
      credits_reserved_min: 1,
      direction_raw: params.Direction ?? null,
      ...(refs.rejected.length ? { rejected_refs: refs.rejected } : {}),
    },
  });

  if (recordingEnabled) {
    await sb
      .from('call_consents')
      .insert({
        organization_id: orgId,
        call_id: callId,
        consent_type: 'recording',
        method: 'voice_announcement',
        locale: 'es-MX',
        recorded_announcement_text: settings.voice_consent_message,
      })
      .then(({ error }) => {
        if (error) console.warn('[TwiML Outbound] call_consents:', error.message);
      });
  }

  return xmlResponse(
    buildOutboundBrowserTwiml({
      origin,
      callId,
      to,
      callerId,
      recordingEnabled,
      ringTimeoutSeconds: settings.voice_ring_timeout_seconds,
      agentPrompt: recordingEnabled ? AGENT_RECORDING_PROMPT : null,
    })
  );
}

async function handleRestOriginated(input: { params: Record<string, string>; origin: string; callSid: string; rawTo: string }): Promise<Response> {
  const { params, origin, callSid, rawTo } = input;
  let orgId: number;
  let sb: SupabaseClient;
  try {
    const resolved = await resolveOrgFromExternal(callSid, 'call_sid');
    orgId = resolved.organizationId;
    sb = resolved.serviceClient;
  } catch (err) {
    if (err instanceof OrgContextError) {
      console.warn('[TwiML Outbound] REST: CallSid sin fila en calls', callSid);
      return xmlResponse(buildHangupTwiml('Llamada no registrada.'));
    }
    throw err;
  }
  const { data: callRow } = await sb
    .from('calls')
    .select('id, to_number, from_number, recording_enabled')
    .eq('organization_id', orgId)
    .eq('provider_call_sid', callSid)
    .maybeSingle();
  const call = callRow as { id: string; to_number: string; from_number: string; recording_enabled: boolean } | null;
  const settings = await getTelephonySettings(orgId, sb);
  const to = normalizeTo(call?.to_number || rawTo);
  if (!call || !to) return xmlResponse(buildHangupTwiml('Llamada no registrada.'));
  const parts: string[] = [];
  if (call.recording_enabled && settings.voice_consent_message) {
    parts.push(`  <Say language="es-MX" voice="Polly.Mia-Neural">${escapeXml(settings.voice_consent_message)}</Say>`);
  }
  const twiml = buildOutboundBrowserTwiml({
    origin,
    callId: call.id,
    to,
    callerId: call.from_number || params.From || '',
    recordingEnabled: call.recording_enabled,
    ringTimeoutSeconds: settings.voice_ring_timeout_seconds,
  });
  return xmlResponse(parts.length ? twiml.replace('<Response>\n', `<Response>\n${parts.join('\n')}\n`) : twiml);
}

/**
 * Destino marcable (defecto B1). La regla vive en `normalizeDialableE164`
 * (`twilioConfig`) para que `/api/voice/call` use exactamente la misma.
 */
function normalizeTo(raw: string): string | null {
  return normalizeDialableE164(raw);
}

function uuidOrNull(v: string | undefined): string | null {
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

async function insertCall(
  sb: SupabaseClient,
  p: {
    orgId: number; callSid: string; userId: string; callerId: string; to: string;
    customerId: string | null; opportunityId: string | null; recordingEnabled: boolean;
    status: 'dialing' | 'failed'; metadata: Record<string, unknown>;
  }
): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('calls')
    .insert({
      organization_id: p.orgId,
      provider: 'twilio',
      provider_call_sid: p.callSid,
      direction: 'outbound',
      mode: 'browser',
      from_number: p.callerId,
      to_number: p.to,
      customer_id: p.customerId,
      opportunity_id: p.opportunityId,
      user_id: p.userId,
      status: p.status,
      started_at: now,
      ended_at: p.status === 'failed' ? now : null,
      recording_enabled: p.recordingEnabled,
      // Dato de cumplimiento: `false` hasta que `consent-whisper` confirme que
      // el anuncio SÍ se reprodujo al cliente (antes se marcaba true incluso en
      // llamadas que nunca llegaron a sonar).
      consent_given: false,
      cost_currency: 'USD',
      duration_source: 'provider',
      metadata: p.metadata,
    })
    .select('id')
    .single();
  if (error) throw new Error(`calls insert: ${error.message}`);
  return (data as { id: string }).id;
}
