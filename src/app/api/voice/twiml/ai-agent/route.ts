/**
 * POST /api/voice/twiml/ai-agent — TwiML del agente IA de voz.
 *
 * Twilio pide este TwiML cuando el cliente contesta. Con grabación activa la
 * respuesta viaja en DOS documentos (A-2, igual que `twiml/inbound`):
 *   1ª pasada: `<Say>` con el aviso de grabación (D9 · Ley 1581) + `<Redirect>`
 *      a esta misma ruta con un HMAC ligado al `CallSid` (`signConsentToken`).
 *      Twilio solo pide ese redirect cuando el `<Say>` ha TERMINADO de sonar.
 *   2ª pasada: se escribe el acta por `recordConsent` (único escritor de
 *      `call_consents`), se emite `<Start><Recording channels="dual"/>` y
 *      DESPUÉS `<Connect><ConversationRelay …>` con la configuración REAL del
 *      agente: voz (incluida la voz clonada del vendedor), TTS, STT, saludo,
 *      idioma, interrupciones y DTMF.
 * Sin grabación no hay nada que acreditar y todo va en una sola pasada.
 *
 * Por qué dos pasadas (la ronda anterior alegó que rompería `ConversationRelay`):
 * `<Redirect>` es TwiML estándar y `<Connect>` es perfectamente válido como
 * primer verbo del documento redirigido; ConversationRelay no impone ser el
 * primer documento de la llamada. La prueba A-2.3 de `f3f5Round4Consent`
 * ejerce la ruta real y obtiene el `<ConversationRelay>` completo —con su
 * `welcomeGreeting`, sus `<Parameter>` y el token del ws-server— en la segunda
 * pasada.
 *
 * Grabación (ronda 5): `<Start><Recording>` es la vía que Twilio documenta
 * para grabar una llamada que fluye a `<Connect><ConversationRelay>` (doc
 * TwiML `<Recording>` y anuncio de GA de `<Start><Recording>`): arranca la
 * grabación ANTES de ejecutar el verbo siguiente, no bloquea, y `channels`
 * dual + `recordingStatusCallback` van al mismo `/api/voice/recording` que el
 * resto de la telefonía. La ronda 4 la pedía por REST
 * (`calls(sid).recordings.create()`) y se tragaba el fallo en un `catch`,
 * dejando `recording_enabled=true` y un acta para una grabación inexistente.
 * Ahora: sin acta no se emite `<Start><Recording>` y la fila pasa a
 * `recording_enabled=false`; y si Twilio reporta la grabación `absent`,
 * `/api/voice/recording` retira acta y flags (`voidConsentWithoutRecording`).
 *
 * V-2 (ronda 5): sin `callId`, o con un `voice_agent_calls.call_id` nulo, no
 * hay fila `calls` donde colgar el acta → NO se graba (ni aviso ni
 * `<Start><Recording>`), y el agente atiende igual.
 *
 * N-2 (ronda 6): el acta se escribe ANTES de emitir el TwiML que graba, pero
 * si algo falla DESPUÉS del acta y antes de devolverlo (`voice_agent_calls`,
 * token del ws-server…), la respuesta es `<Hangup/>` y `<Start><Recording>`
 * nunca sale: Twilio no enviará `absent` de una grabación que no arrancó, así
 * que el acta se retira aquí mismo (`voidConsentWithoutRecording`). Sin eso
 * quedaba acta + `consent_given=true` + `recording_enabled=true` para una
 * grabación que nunca existió, y ningún callback lo iba a corregir.
 *
 * N-7 (ronda 6): el origen de los callbacks (`<Redirect>`, `recordingStatusCallback`,
 * `action` del `<Connect>`) sale de `getTwilioWebhookOrigin()`, como el resto
 * de la telefonía, no de `request.url` (que controla quien firma la petición).
 *
 * Seguridad:
 * - Firma verificada SIEMPRE, antes de tocar la base (F0, C-E).
 * - La org sale de la fila `voice_agents`; `voice_agent_calls` se actualiza
 *   filtrando por `organization_id` y `voice_agent_id` (C-F).
 * - Idempotente (D5): un segundo POST con el mismo CallSid no reescribe `started_at`.
 *
 * Degradación sin `VOICE_CALLBACK_SECRET`: no se puede acreditar el aviso, así
 * que NO se graba (ni acta ni `<Start><Recording>`) y el agente atiende igual.
 * Nunca grabar sin acta; no grabar sin consentimiento.
 *
 * Query params: agentId, callId, ct (token de consentimiento, 2ª pasada)
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError, getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { issueWsSessionToken, readWsSessionSecret } from '@/lib/security/wsSessionToken';
import { buildRuntimeConfig, AgentRuntimeError, twilioLanguage } from '@/lib/services/crm/voiceAgent/agentRuntime';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { escapeXml, buildCallbackUrl, CONSENT_LANGUAGE, CONSENT_VOICE, RECORDING_EVENTS } from '@/lib/services/crm/twimlBuilders';
import { isBridgeSigningConfigured, signConsentToken, verifyConsentToken } from '@/lib/services/crm/bridgeTokens';
import { recordConsent, recordingEnabledForCall, voidConsentWithoutRecording } from '@/lib/services/crm/consentService';
import { updateCall } from '@/lib/services/crm/callManagementService';

export const runtime = 'nodejs';

const XML_HEADERS = { 'Content-Type': 'text/xml' };

function sayHangup(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${CONSENT_VOICE}" language="${CONSENT_LANGUAGE}">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

/** Atributo XML solo si hay valor (evita `voice=""`, que Twilio rechaza). */
function attr(name: string, value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `\n      ${name}="${escapeXml(String(value))}"`;
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[AI Agent TwiML] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  const search = new URL(request.url).searchParams;
  const agentId = search.get('agentId') || '';
  const callId = search.get('callId') || '';
  const callSid = params.CallSid || null;

  if (!agentId) {
    return new NextResponse(sayHangup('Error: agente no especificado.'), { status: 200, headers: XML_HEADERS });
  }

  // C-F6-17: sin WS_SESSION_SECRET no hay agente posible. Se detecta ANTES de la base
  // y se dice con claridad, en vez de caer en un «Ocurrió un error» genérico.
  // F0-SEC r2: «sin» incluye el relleno de .env.example y valores < 32 caracteres
  // (mismo criterio que el ws-server, que rechazaría el handshake de todos modos).
  if (!readWsSessionSecret()) {
    console.error('[AI Agent TwiML] WS_SESSION_SECRET no configurado o de relleno: el agente IA no puede operar');
    return new NextResponse(
      sayHangup('El asistente virtual no está configurado en este momento. Un asesor le contactará.'),
      { status: 200, headers: XML_HEADERS }
    );
  }

  const supabase = getServiceClient();

  let config;
  try {
    config = await buildRuntimeConfig(supabase, { agentId, callId: callId || null });
  } catch (error) {
    if (error instanceof AgentRuntimeError) {
      console.warn('[AI Agent TwiML] Configuración no disponible:', error.reason, error.message);
      return new NextResponse(sayHangup('El agente no está disponible en este momento.'), {
        status: 200,
        headers: XML_HEADERS,
      });
    }
    console.error('[AI Agent TwiML] Error:', error);
    return new NextResponse(sayHangup('Ocurrió un error. Por favor intente más tarde.'), {
      status: 200,
      headers: XML_HEADERS,
    });
  }

  const agentOrgId = config.orgId;

  // Aislamiento multi-tenant (M1, gemelo N-2): `agentId`/`callId` vienen de la
  // query. Sin esta comprobación, la subcuenta de otra organización obtenía el
  // TwiML del agente ajeno (incluido el token del ws-server) y le movía el estado.
  if (!(await accountSidMatchesOrg(agentOrgId, accountSid, supabase))) {
    console.warn('[AI Agent TwiML] AccountSid ajeno a la org del agente', { org: agentOrgId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  type VacRow = {
    started_at: string | null;
    provider_call_sid: string | null;
    call_id: string | null;
    customer_id: string | null;
  };
  let row: VacRow | null = null;
  if (callId) {
    const { data: existing, error: readError } = await supabase
      .from('voice_agent_calls')
      .select('id, started_at, provider_call_sid, call_id, customer_id')
      .eq('id', callId)
      .eq('organization_id', agentOrgId)
      .eq('voice_agent_id', agentId)
      .maybeSingle();
    if (readError) {
      console.error('[AI Agent TwiML] Error:', readError.message);
      return new NextResponse(sayHangup('Ocurrió un error. Por favor intente más tarde.'), { status: 200, headers: XML_HEADERS });
    }
    row = (existing as VacRow | null) ?? null;
  }
  /** Fila `calls` donde colgar el acta. Sin ella no hay acta posible (V-2). */
  const consentCallId = row?.call_id ?? null;

  // Sin secreto de firma no hay acta posible → no se graba (ver cabecera).
  // Sin `CallSid` el token no se puede ligar a nada (`verifyConsentToken` daría
  // `false` siempre y la segunda pasada repetiría el aviso en bucle). Sin fila
  // `calls` enlazada no hay dónde escribir el acta (V-2).
  const canProveConsent = isBridgeSigningConfigured() && Boolean(callSid) && Boolean(consentCallId);
  // F-2 (ronda 7, gemelo de N-1): la fila `calls.recording_enabled` —fijada al
  // marcar por `voiceAgentService`— es la ÚNICA fuente de verdad, igual que en
  // `customer-leg`/`agent-leg`. `config.recordingEnabled` sale de la misma fila
  // (`agentRuntime`) y gobierna el prompt; aquí se relee explícitamente para
  // que el TwiML nunca dependa de una relectura de `comm_settings`. Falla
  // CERRADO: fila en `false`/NULL o de otra organización → no se graba.
  const rowRecordingEnabled = canProveConsent && (await recordingEnabledForCall(consentCallId, agentOrgId, supabase));
  let recordingEnabled = config.recordingEnabled && rowRecordingEnabled;
  if (config.recordingEnabled && canProveConsent && !rowRecordingEnabled) {
    console.warn('[AI Agent TwiML] la fila `calls` no autoriza la grabación: no se graba', { org: agentOrgId, callId: consentCallId });
  }
  if (config.recordingEnabled && !canProveConsent) {
    console.warn('[AI Agent TwiML] grabación inhibida: no se puede acreditar el aviso (Ley 1581)', {
      org: agentOrgId,
      faltaSecreto: !isBridgeSigningConfigured(),
      faltaCallSid: !callSid,
      faltaFilaCalls: !consentCallId,
    });
  }
  /** `true` solo si vuelve el token que este servidor acuñó para ESTE CallSid. */
  const announced = verifyConsentToken(callSid ?? '', search.get('ct'));
  /** Origen de TODOS los callbacks: configuración, nunca la URL de la petición (N-7). */
  let origin: string;
  try {
    origin = getTwilioWebhookOrigin();
  } catch (err) {
    console.error('[AI Agent TwiML] TWILIO_WEBHOOK_BASE_URL ausente o inválido: sin origen para los callbacks', err instanceof Error ? err.message : err);
    return new NextResponse(sayHangup('El asistente virtual no está configurado en este momento. Un asesor le contactará.'), { status: 200, headers: XML_HEADERS });
  }

  // 1ª pasada (A-2): SOLO el aviso. No se escribe acta, no se graba y no se
  // abre todavía el ConversationRelay. Quien cuelgue durante el aviso no deja
  // un consentimiento registrado que nunca existió.
  if (recordingEnabled && !announced && config.consentMessage) {
    const back = buildCallbackUrl(origin, '/api/voice/twiml/ai-agent', { agentId, callId: callId || undefined, ct: signConsentToken(callSid ?? '') });
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${CONSENT_VOICE}" language="${CONSENT_LANGUAGE}">${escapeXml(config.consentMessage)}</Say>
  <Redirect method="POST">${escapeXml(back)}</Redirect>
</Response>`,
      { status: 200, headers: XML_HEADERS }
    );
  }

  /** Acta escrita en ESTA petición: si algo falla después, se retira (N-2). */
  let consentWritten = false;
  try {
    // 2ª pasada (o única, sin grabación). Acta PRIMERO: sin acta no hay
    // `<Start><Recording>` y la fila dice `recording_enabled=false`.
    if (recordingEnabled && consentCallId) {
      try {
        await recordConsent(
          agentOrgId,
          {
            callId: consentCallId,
            consentType: 'recording',
            consentGiven: true,
            consentMessage: config.consentMessage,
            method: 'voice_announcement',
            locale: CONSENT_LANGUAGE,
          },
          supabase
        );
        consentWritten = true;
      } catch (err) {
        console.error('[AI Agent TwiML] sin acta no se graba:', err instanceof Error ? err.message : err, { org: agentOrgId });
        recordingEnabled = false;
        await updateCall(consentCallId, agentOrgId, { recording_enabled: false }, supabase);
      }
    }

    // D5 (idempotencia): solo se marca el inicio la primera vez. Si ya hay
    // `provider_call_sid` de OTRA llamada, este POST no toca la fila.
    if (callId && row && (!row.provider_call_sid || !callSid || row.provider_call_sid === callSid)) {
      const patch: Record<string, unknown> = {
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      };
      if (!row.started_at) patch.started_at = new Date().toISOString();
      if (callSid && !row.provider_call_sid) patch.provider_call_sid = callSid;
      // Solo con acta escrita (arriba): el aviso YA sonó y el token lo acredita.
      if (recordingEnabled) patch.consent_given = true;

      const { error: updError } = await supabase
        .from('voice_agent_calls')
        .update(patch)
        .eq('id', callId)
        .eq('organization_id', agentOrgId)
        .eq('voice_agent_id', agentId);
      if (updError) throw updError;

      // La llamada ya está contestada y con el agente en línea.
      if (consentCallId) {
        await updateCall(consentCallId, agentOrgId, { status: 'in_progress', answered_at: new Date().toISOString() }, supabase);
      }
    }

    const wsHost = process.env.WS_SERVER_URL || 'wss://localhost:8080';
    const token = issueWsSessionToken({
      orgId: agentOrgId,
      agentId,
      callId: callId || null,
      callSid,
    });
    // El token viaja en la query porque el ws-server debe autenticar el UPGRADE,
    // antes de recibir ningún <Parameter>. Va además como <Parameter> (doble check).
    const wsUrl = `${wsHost}/conversation-relay?st=${encodeURIComponent(token)}`;
    const language = twilioLanguage(config.agent.language);

    // C-F6-09: el aviso de grabación es OBLIGATORIO y no depende del agente,
    // pero ya viajó en su PROPIA pasada (arriba). Repetirlo aquí se lo haría
    // oír dos veces al cliente, así que este documento no lo lleva.
    //
    // La grabación arranca AQUÍ, con el acta ya escrita y el aviso ya emitido,
    // por la vía documentada para ConversationRelay: `<Start><Recording>` antes
    // del `<Connect>`. Sin acta (`recordingEnabled` cayó a false) no se emite.
    const startRecording = recordingEnabled
      ? `
  <Start>
    <Recording channels="dual" recordingStatusCallback="${escapeXml(buildCallbackUrl(origin, '/api/voice/recording'))}" recordingStatusCallbackEvent="${RECORDING_EVENTS}"/>
  </Start>`
      : '';

    const relayAttrs =
      attr('url', wsUrl) +
      attr('language', language) +
      attr('ttsLanguage', language) +
      attr('transcriptionLanguage', language) +
      attr('ttsProvider', config.voice.ttsProvider) +
      attr('voice', config.voice.voice) +
      attr('transcriptionProvider', config.agent.stt_provider === 'deepgram' ? 'Deepgram' : undefined) +
      attr('speechModel', config.agent.stt_provider === 'deepgram' ? 'nova-3-general' : undefined) +
      attr('welcomeGreeting', config.greeting) +
      attr('welcomeGreetingInterruptible', 'any') +
      attr('interruptible', 'any') +
      attr('dtmfDetection', 'true') +
      attr('reportInputDuringAgentSpeech', 'none');

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${startRecording}
  <Connect action="${escapeXml(`${origin}/api/voice/ai-agent/status?callId=${encodeURIComponent(callId)}&handoff=1`)}">
    <ConversationRelay${relayAttrs}
    >
      <Parameter name="agentId" value="${escapeXml(agentId)}" />
      <Parameter name="callId" value="${escapeXml(callId)}" />
      <Parameter name="orgId" value="${agentOrgId}" />
      <Parameter name="token" value="${escapeXml(token)}" />
    </ConversationRelay>
  </Connect>
</Response>`;

    return new NextResponse(twiml, { status: 200, headers: XML_HEADERS });
  } catch (error) {
    console.error('[AI Agent TwiML] Error:', error);
    // N-2: la respuesta es <Hangup/> y `<Start><Recording>` no sale, así que
    // Twilio jamás enviará `absent`. El acta escrita arriba se retira aquí.
    if (consentWritten && consentCallId) {
      try {
        await voidConsentWithoutRecording(consentCallId, agentOrgId, supabase, 'ai_agent_twiml_failed_after_consent');
      } catch (voidErr) {
        console.error('[AI Agent TwiML] no se pudo retirar el acta tras el fallo (queda para la reconciliación diaria):', voidErr instanceof Error ? voidErr.message : voidErr, { org: agentOrgId, callId: consentCallId });
      }
    }
    return new NextResponse(sayHangup('Ocurrió un error. Por favor intente más tarde.'), {
      status: 200,
      headers: XML_HEADERS,
    });
  }
}
