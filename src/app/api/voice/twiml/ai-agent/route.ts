/**
 * POST /api/voice/twiml/ai-agent — TwiML del agente IA de voz.
 *
 * Twilio pide este TwiML cuando el cliente contesta. Con grabación activa la
 * respuesta viaja en DOS documentos (A-2, igual que `twiml/inbound`):
 *   1ª pasada: `<Say>` con el aviso de grabación (D9 · Ley 1581) + `<Redirect>`
 *      a esta misma ruta con un HMAC ligado al `CallSid` (`signConsentToken`).
 *      Twilio solo pide ese redirect cuando el `<Say>` ha TERMINADO de sonar.
 *   2ª pasada: se escribe el acta (`call_consents`, `consent_given`), se ARRANCA
 *      la grabación por REST y se devuelve
 *      `<Connect><ConversationRelay …>` con la configuración REAL del agente:
 *      voz (incluida la voz clonada del vendedor), TTS, STT, saludo, idioma,
 *      interrupciones y DTMF.
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
 * Y separar las pasadas no bastaba: la grabación del agente arrancaba en
 * `voiceAgentService` con `record: true` en el `calls.create`, o sea desde que
 * contestan y ANTES del aviso. Eso arreglaba la FECHA del acta pero no la
 * EXISTENCIA de la grabación. Ahora `calls.create` no graba y la grabación se
 * pide aquí, tras el aviso, con `calls(sid).recordings.create()`.
 *
 * Seguridad:
 * - Firma verificada SIEMPRE, antes de tocar la base (F0, C-E).
 * - La org sale de la fila `voice_agents`; `voice_agent_calls` se actualiza
 *   filtrando por `organization_id` y `voice_agent_id` (C-F).
 * - Idempotente (D5): un segundo POST con el mismo CallSid no reescribe `started_at`.
 *
 * Degradación sin `VOICE_CALLBACK_SECRET`: no se puede acreditar el aviso, así
 * que NO se graba (ni acta ni `recordings.create`) y el agente atiende igual.
 * Nunca grabar sin acta; no grabar sin consentimiento.
 *
 * Query params: agentId, callId, ct (token de consentimiento, 2ª pasada)
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { issueWsSessionToken } from '@/lib/security/wsSessionToken';
import { buildRuntimeConfig, AgentRuntimeError, twilioLanguage } from '@/lib/services/crm/voiceAgent/agentRuntime';
import { accountSidMatchesOrg, getTwilioClientForOrg } from '@/lib/services/crm/voiceContextService';
import { escapeXml, CONSENT_LANGUAGE, CONSENT_VOICE } from '@/lib/services/crm/twimlBuilders';
import { isBridgeSigningConfigured, signConsentToken, verifyConsentToken } from '@/lib/services/crm/bridgeTokens';

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
  if (!process.env.WS_SESSION_SECRET) {
    console.error('[AI Agent TwiML] WS_SESSION_SECRET no configurado: el agente IA no puede operar');
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

  // Sin secreto de firma no hay acta posible → no se graba (ver cabecera).
  // Sin `CallSid` el token no se puede ligar a nada (`verifyConsentToken` daría
  // `false` siempre y la segunda pasada repetiría el aviso en bucle), y sin él
  // tampoco hay llamada sobre la que arrancar la grabación por REST.
  const canProveConsent = isBridgeSigningConfigured() && Boolean(callSid);
  const recordingEnabled = config.recordingEnabled && canProveConsent;
  if (config.recordingEnabled && !canProveConsent) {
    console.warn('[AI Agent TwiML] grabación inhibida: no se puede acreditar el aviso (Ley 1581)', {
      org: agentOrgId,
      faltaSecreto: !isBridgeSigningConfigured(),
      faltaCallSid: !callSid,
    });
  }
  /** `true` solo si vuelve el token que este servidor acuñó para ESTE CallSid. */
  const announced = verifyConsentToken(callSid ?? '', search.get('ct'));

  // Aislamiento multi-tenant (M1, gemelo N-2): `agentId`/`callId` vienen de la
  // query. Sin esta comprobación, la subcuenta de otra organización obtenía el
  // TwiML del agente ajeno (incluido el token del ws-server) y le movía el estado.
  if (!(await accountSidMatchesOrg(agentOrgId, accountSid, supabase))) {
    console.warn('[AI Agent TwiML] AccountSid ajeno a la org del agente', { org: agentOrgId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 1ª pasada (A-2): SOLO el aviso. No se escribe acta, no se graba y no se
  // abre todavía el ConversationRelay. Quien cuelgue durante el aviso no deja
  // un consentimiento registrado que nunca existió.
  if (recordingEnabled && !announced && config.consentMessage) {
    const back = new URL(request.url);
    back.searchParams.set('ct', signConsentToken(callSid ?? ''));
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${CONSENT_VOICE}" language="${CONSENT_LANGUAGE}">${escapeXml(config.consentMessage)}</Say>
  <Redirect method="POST">${escapeXml(back.toString())}</Redirect>
</Response>`,
      { status: 200, headers: XML_HEADERS }
    );
  }

  try {
    // D5 (idempotencia): solo se marca el inicio la primera vez. Si ya hay
    // `provider_call_sid` de OTRA llamada, este POST no toca la fila.
    if (callId) {
      const { data: existing, error: readError } = await supabase
        .from('voice_agent_calls')
        .select('id, started_at, provider_call_sid, call_id, customer_id')
        .eq('id', callId)
        .eq('organization_id', agentOrgId)
        .eq('voice_agent_id', agentId)
        .maybeSingle();
      if (readError) throw readError;

      const row = existing as {
        started_at: string | null;
        provider_call_sid: string | null;
        call_id: string | null;
        customer_id: string | null;
      } | null;

      if (row && (!row.provider_call_sid || !callSid || row.provider_call_sid === callSid)) {
        const patch: Record<string, unknown> = {
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        };
        if (!row.started_at) patch.started_at = new Date().toISOString();
        if (callSid && !row.provider_call_sid) patch.provider_call_sid = callSid;
        // Solo aquí (2ª pasada): el aviso YA sonó y el token lo acredita.
        if (recordingEnabled) patch.consent_given = true;

        const { error: updError } = await supabase
          .from('voice_agent_calls')
          .update(patch)
          .eq('id', callId)
          .eq('organization_id', agentOrgId)
          .eq('voice_agent_id', agentId);
        if (updError) throw updError;

        // Consentimiento de grabación registrado (D9), una sola vez por llamada.
        if (recordingEnabled && row.call_id) {
          const { data: prev, error: prevError } = await supabase
            .from('call_consents')
            .select('id')
            .eq('organization_id', agentOrgId)
            .eq('call_id', row.call_id)
            .eq('consent_type', 'recording')
            .maybeSingle();
          if (prevError) throw prevError;
          if (!prev) {
            const { error: consentError } = await supabase.from('call_consents').insert({
              organization_id: agentOrgId,
              call_id: row.call_id,
              consent_type: 'recording',
              announced_at: new Date().toISOString(),
              method: 'voice_announcement',
              locale: CONSENT_LANGUAGE,
              recorded_announcement_text: config.consentMessage,
            });
            if (consentError) throw consentError;
            const { error: callError } = await supabase
              .from('calls')
              .update({ consent_given: true, status: 'in_progress', answered_at: new Date().toISOString() })
              .eq('id', row.call_id)
              .eq('organization_id', agentOrgId);
            if (callError) throw callError;
          }
        }
      }
    }

    // A-2: la grabación arranca AQUÍ, con el acta ya escrita y el aviso ya
    // emitido — no en el `calls.create` de `voiceAgentService`, que grababa
    // desde que contestaban. `ConversationRelay` no admite un atributo `record`
    // en TwiML, así que la vía es la REST de Twilio sobre la llamada en curso.
    if (recordingEnabled && callSid) {
      try {
        const { client } = await getTwilioClientForOrg(agentOrgId);
        await (client as unknown as { calls: (sid: string) => { recordings: { create: (o: Record<string, unknown>) => Promise<unknown> } } })
          .calls(callSid)
          .recordings.create({
            recordingChannels: 'dual',
            recordingStatusCallback: `${new URL(request.url).origin}/api/voice/recording`,
            recordingStatusCallbackEvent: ['completed', 'absent'],
          });
      } catch (recError) {
        // Que falle la grabación no debe tumbar la llamada: el agente sigue.
        console.error('[AI Agent TwiML] no se pudo iniciar la grabación:', recError instanceof Error ? recError.message : recError);
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
    const consentSay = '';

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
<Response>${consentSay}
  <Connect action="${escapeXml(`${new URL(request.url).origin}/api/voice/ai-agent/status?callId=${encodeURIComponent(callId)}&handoff=1`)}">
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
    return new NextResponse(sayHangup('Ocurrió un error. Por favor intente más tarde.'), {
      status: 200,
      headers: XML_HEADERS,
    });
  }
}
