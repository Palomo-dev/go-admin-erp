/**
 * ConversationRelay Handler — Maneja sesiones de voz via texto
 * GO Admin ERP
 *
 * Twilio ConversationRelay envía texto (post-STT) y recibe texto (pre-TTS).
 * Este handler conecta esos mensajes con el modelo (streaming + function calling).
 *
 * 2026-09-30: el modelo se llama por el MISMO adaptador que el GO Assistant
 * (`@/lib/ai/agent/openaiAdapter`): Responses API para `gpt-5.x`/`gpt-6.x`,
 * Chat Completions para los legacy, razonamiento mínimo y respaldo a
 * `EMERGENCY_MODEL`. Antes se llamaba a Chat Completions con `max_tokens` para
 * cualquier modelo y `gpt-5.6-luna` respondía 400 en cada turno.
 */

import type WebSocket from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { buildVoiceAgentPrompt, tipoDeNegocio, type VoiceAgentContext } from './voiceAgentPrompts';
import { VOICE_AGENT_TOOLS, executeToolCall } from './voiceAgentTools';
import { consumeWsSessionJti, verifyWsSessionToken, type WsSessionClaims } from '@/lib/security/wsSessionToken';
// F6: cuando la llamada trae `agentId`, el cerebro es el del agente del CRM
// (voice_agents + stage_agents), no el recepcionista de hotel.
import {
  buildRuntimeConfig,
  persistConversation,
  type AgentRuntimeConfig,
  type ConversationTurn,
} from '@/lib/services/crm/voiceAgent/agentRuntime';
import { executeTool as executeCrmTool } from '@/lib/services/crm/voiceAgentTools';
import { openModelStream, type AdapterMessage, type AdapterTool } from '@/lib/ai/agent/openaiAdapter';
import type { JsonSchemaObject } from '@/lib/ai/agent/types';
import { abrirSesionCreditoVoz, conciliarSesionCreditoVoz } from '@/lib/services/crm/voiceAgent/creditosVoz';
import {
  isTtsError,
  twilioErrorCode,
  TtsFallbackTracker,
  TTS_FALLBACK_PARAM,
} from '@/lib/services/crm/voiceAgent/ttsFallback';
import {
  FRASE_AVISO_SILENCIO,
  FRASE_CIERRE_SILENCIO,
  VigilanteSilencio,
} from '@/lib/services/crm/voiceAgent/inactividad';

/** Cliente con service_role para bypasear RLS en el WS server */
function getServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ─── Tipos de mensajes ConversationRelay ────────────────

/** Mensaje enviado por Twilio al conectar la llamada */
interface CRSetupMessage {
  type: 'setup';
  callSid: string;
  from: string;
  to: string;
  accountSid?: string;
  customParameters?: Record<string, string>;
}

/** Mensaje con el texto transcrito del usuario */
interface CRPromptMessage {
  type: 'prompt';
  voicePrompt?: string;
  voiceInput?: string;
  transcript?: string;
  text?: string;
  lang?: string;
  last?: boolean;
}

/** Mensaje cuando el usuario interrumpe al agente */
interface CRInterruptMessage {
  type: 'interrupt';
}

/** Mensaje DTMF (tonos del teclado) */
interface CRDtmfMessage {
  type: 'dtmf';
  digit: string;
}

/** Error que reporta Twilio (p. ej. TTS: «Error converting tokens to speech, code: 64111»). */
interface CRErrorMessage {
  type: 'error';
  description?: string;
}

type CRInboundMessage = CRSetupMessage | CRPromptMessage | CRInterruptMessage | CRDtmfMessage | CRErrorMessage;

// ─── Sesión de ConversationRelay ────────────────────────

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  /** C-13: sin esto el historial que se manda a OpenAI es inválido y responde 400. */
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

export interface ConversationRelaySession {
  callSid: string;
  orgId: number;
  callerNumber: string;
  messages: ConversationMessage[];
  startedAt: Date;
  isActive: boolean;
  /** F6: configuración real del agente + etapa del embudo (null en el flujo genérico). */
  runtime?: AgentRuntimeConfig | null;
  /** Turnos para `voice_agent_calls.conversation_log`. */
  turns: ConversationTurn[];
  /** Cuelga si la línea queda en silencio (ver `voiceAgent/inactividad.ts`). */
  silencio?: VigilanteSilencio;
}

const activeSessions = new Map<string, ConversationRelaySession>();

// ─── Helper para mapear mensajes al adaptador del modelo ─────

/**
 * C-13: los `tool_calls` DEBEN viajar en el mensaje del asistente que precede a
 * los mensajes `role:'tool'`; si se descartan, el proveedor rechaza el historial.
 * El adaptador los traduce a Chat Completions o a la Responses API.
 */
export function toAdapterMessages(messages: ConversationMessage[]): AdapterMessage[] {
  return messages.map((m): AdapterMessage => {
    if (m.role === 'tool') return { role: 'tool', content: m.content, toolCallId: m.tool_call_id || '' };
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        toolCalls: m.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/** Herramientas de la sesión en el formato plano del adaptador. */
function sessionTools(session: ConversationRelaySession): AdapterTool[] {
  if (session.runtime) {
    return session.runtime.toolDefinitions.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters as unknown as JsonSchemaObject,
    }));
  }
  return VOICE_AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as unknown as JsonSchemaObject,
  }));
}

/**
 * Tras ejecutar herramientas se vuelve a llamar al modelo con los resultados.
 * Puede pedir más herramientas (p. ej. consultar disponibilidad y luego
 * agendar); a partir de esta profundidad se le quitan para que conteste.
 */
const MAX_TOOL_ROUNDS = 3;

/** Estado de TTS por conexión (respaldo ante el error 64111/64112). */
const ttsTrackers = new WeakMap<WebSocket, TtsFallbackTracker>();

// ─── Handler principal ──────────────────────────────────

/**
 * Maneja una conexión WebSocket de ConversationRelay.
 * Twilio envía texto (post-STT), respondemos con texto (pre-TTS).
 *
 * F0 (C22): `upgradeClaims` son los claims del token de sesión verificado en
 * el upgrade (ws-server). En `setup` se exige además `customParameters.token`
 * válido y coherente con el upgrade (misma org). Sin token → cierre 1008.
 */
export function handleConversationRelayConnection(ws: WebSocket, upgradeClaims?: WsSessionClaims | null): void {
  let session: ConversationRelaySession | null = null;
  let tts: TtsFallbackTracker | null = null;
  let closing = false;

  ws.on('message', async (data) => {
    let msgType = 'unknown';
    try {
      const raw = data.toString();
      const message: CRInboundMessage = JSON.parse(raw);
      msgType = message.type;
      console.log(`[CR] << Incoming (${msgType}):`, raw.substring(0, 300));

      switch (message.type) {
        case 'setup': {
          const claims = verifyWsSessionToken(message.customParameters?.token);
          if (!claims || (upgradeClaims && (upgradeClaims.orgId !== claims.orgId || upgradeClaims.jti !== claims.jti ||
              upgradeClaims.callSid !== claims.callSid || upgradeClaims.agentId !== claims.agentId || upgradeClaims.callId !== claims.callId))) {
            console.warn('[CR] setup rechazado: token de sesión inválido/expirado o incoherente');
            ws.close(1008, 'unauthorized');
            return;
          }
          // F0-SEC r2: un token vale para UNA sesión. El mismo `jti` en un segundo
          // `setup` (handshake capturado y repetido dentro del TTL) se rechaza.
          if (!consumeWsSessionJti(claims)) {
            console.warn('[CR] setup rechazado: token de sesión reutilizado o sin jti', { orgId: claims.orgId, callSid: claims.callSid ?? null });
            ws.close(1008, 'unauthorized');
            return;
          }
          // El error de TTS del saludo puede llegar mientras `handleSetup` lee la
          // base: el estado de TTS se crea ANTES del primer `await`.
          tts = new TtsFallbackTracker(message.customParameters?.[TTS_FALLBACK_PARAM] || null);
          ttsTrackers.set(ws, tts);
          session = await handleSetup(ws, message, claims);
          if (session && (closing || ws.readyState !== 1)) await endSession(session);
          break;
        }

        case 'error':
          handleRelayError(ws, tts, session, message);
          break;

        case 'prompt':
          if (session) {
            session.silencio?.pausar();
            try {
              await handlePrompt(ws, session, message);
            } finally {
              session.silencio?.reiniciar();
            }
          }
          break;

        case 'interrupt':
          // El usuario interrumpió — detener generación actual. Está hablando:
          // el conteo de silencio vuelve a empezar.
          console.log(`[CR] Interrupción en ${session?.callSid}`);
          session?.silencio?.reiniciar();
          break;

        case 'dtmf':
          console.log(`[CR] DTMF: ${message.digit} en ${session?.callSid}`);
          break;

        default:
          console.log('[CR] Mensaje desconocido:', message);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : '';
      console.error(`[CR] Error procesando mensaje (type=${msgType}):`, errMsg);
      console.error('[CR] Stack:', errStack);
      sendText(ws, 'Disculpe, ocurrió un error. ¿Puede repetir?');
    }
  });

  ws.on('close', () => {
    closing = true;
    if (session) {
      void endSession(session).catch((error) => console.error('[CR] Falló el cierre de sesión:', error));
    }
  });

  ws.on('error', (error) => {
    closing = true;
    console.error('[CR] WebSocket error:', error);
    if (session) {
      void endSession(session).catch((error) => console.error('[CR] Falló el cierre de sesión:', error));
    }
  });
}

// ─── Handlers por tipo de mensaje ───────────────────────

/**
 * Setup: Twilio envía info de la llamada al conectar.
 */
async function handleSetup(
  ws: WebSocket,
  message: CRSetupMessage,
  claims: WsSessionClaims
): Promise<ConversationRelaySession | null> {
  const { callSid, from, to } = message;
  if (!claims.callSid || claims.callSid !== callSid ||
      (message.customParameters?.agentId && message.customParameters.agentId !== claims.agentId) ||
      (message.customParameters?.callId && message.customParameters.callId !== claims.callId)) {
    ws.close(1008, 'unauthorized');
    return null;
  }
  // F0: la org viene del token firmado (no del parámetro en claro ni de un fallback).
  const orgIdParam = message.customParameters?.orgId;
  if (orgIdParam && parseInt(orgIdParam, 10) !== claims.orgId) {
    console.warn('[CR] orgId del <Parameter> no coincide con el token');
    sendEnd(ws);
    return null;
  }
  const orgId = claims.orgId || (await findOrgByNumber(to));

  if (!orgId) {
    sendText(ws, 'Lo sentimos, no pudimos identificar la organización. Adiós.');
    sendEnd(ws);
    return null;
  }

  // Verificar Voice Agent habilitado y créditos
  const sb = getServiceSupabase();
  // F-NEW-8: antes se descartaba el error. Si la lectura falla, el mensaje decía
  // «el asistente no está habilitado», que miente sobre la causa. Ahora se dice
  // la verdad (sigue siendo fail-closed).
  const { data: commSettings, error: commError } = await sb
    .from('comm_settings')
    .select('voice_agent_enabled, voice_minutes_remaining, voice_agent_config, is_active')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (commError) {
    console.error('[CR] No se pudo leer comm_settings:', commError.message, commError.code ?? '');
    sendText(ws, 'No pudimos verificar la configuración del servicio. Un asesor le contactará.');
    sendEnd(ws);
    return null;
  }

  if (!commSettings?.voice_agent_enabled || !commSettings?.is_active) {
    sendText(ws, 'El asistente virtual no está habilitado para esta organización. Lo transferimos con un agente.');
    sendEnd(ws);
    return null;
  }

  if (!claims.callId && commSettings.voice_minutes_remaining !== null && commSettings.voice_minutes_remaining <= 0) {
    sendText(ws, 'No hay minutos disponibles en este momento. Por favor intente más tarde.');
    sendEnd(ws);
    return null;
  }

  // ── F6: si la llamada trae un agente del CRM, manda su configuración ──
  // C-F6-12: antes el `agentId` llegaba en `customParameters` y en los claims y
  // JAMÁS se leía; el prompt salía de `comm_settings` con `business_type || 'hotel'`.
  const agentId = claims.agentId || message.customParameters?.agentId || null;
  let runtime: AgentRuntimeConfig | null = null;
  if (agentId) {
    try {
      runtime = await buildRuntimeConfig(sb, {
        agentId,
        callId: claims.callId || message.customParameters?.callId || null,
        orgId,
      });
      if (runtime.orgId !== orgId || runtime.voiceAgentCallId !== (claims.callId ?? null)) throw new Error('Configuración de otro intento');
    } catch (err) {
      console.error('[CR] No se pudo cargar el agente del CRM:', err instanceof Error ? err.message : err);
      sendEnd(ws);
      return null;
    }
  }

  let systemPrompt: string;
  let greeting: string;
  let agentContext: VoiceAgentContext | null = null;

  if (runtime) {
    systemPrompt = runtime.systemPrompt;
    greeting = runtime.greeting;
  } else {
    agentContext = await buildAgentContext(orgId);
    systemPrompt = buildVoiceAgentPrompt(agentContext);
    greeting = `Hola, gracias por llamar a ${agentContext.organizationName}. ¿En qué puedo ayudarle?`;
  }

  const session: ConversationRelaySession = {
    callSid,
    orgId,
    callerNumber: from,
    messages: [{ role: 'system', content: systemPrompt }],
    startedAt: new Date(),
    isActive: true,
    runtime,
    turns: [],
  };

  // La apertura prueba la reserva saliente y escribe el uso en la misma transacción.
  // Una reserva del último minuto deja saldo cero y sigue autorizando ESTA sesión.
  try {
    await abrirSesionCreditoVoz(sb, orgId, callSid, claims.callId ?? null, session.startedAt.toISOString(), from);
  } catch (error) {
    console.error('[CR] No se pudo acreditar la apertura de voz:', error instanceof Error ? error.message : error, { org: orgId });
    sendEnd(ws);
    return null;
  }

  activeSessions.set(callSid, session);

  session.silencio = new VigilanteSilencio({
    avisar: () => {
      console.log(`[CR] [${callSid}] Silencio: se pregunta si sigue en la línea`);
      session.turns.push({ role: 'assistant', content: FRASE_AVISO_SILENCIO, at: new Date().toISOString() });
      sendText(ws, FRASE_AVISO_SILENCIO, true);
    },
    cerrar: () => {
      console.log(`[CR] [${callSid}] Silencio: se cierra la llamada`);
      session.turns.push({ role: 'assistant', content: FRASE_CIERRE_SILENCIO, at: new Date().toISOString() });
      sendText(ws, FRASE_CIERRE_SILENCIO, true);
      sendEnd(ws);
    },
  });

  // Saludo inicial. Con agente del CRM, `welcomeGreeting` ya lo dijo ConversationRelay:
  // aquí solo entra en el historial para que el modelo no lo repita.
  session.messages.push({ role: 'assistant', content: greeting });
  session.turns.push({ role: 'assistant', content: greeting, at: new Date().toISOString() });
  if (!runtime) {
    sendText(ws, greeting);
  } else {
    // Si el TTS del `welcomeGreeting` ya falló, el saludo se repite con la voz de respaldo.
    const pendiente = ttsTrackers.get(ws)?.seedSpoken(greeting);
    if (pendiente) sendText(ws, pendiente, true);
  }

  session.silencio.reiniciar();

  console.log(
    `[CR] Sesión iniciada: ${callSid} (org: ${orgId}, agente: ${runtime?.agent.name ?? 'genérico'}, ` +
      `objetivo: ${runtime?.stage?.objective ?? 'n/d'}, OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'MISSING'})`
  );
  return session;
}

/**
 * Prompt: Twilio envía el texto transcrito del usuario.
 * Se procesa con el modelo del agente y se responde con texto.
 */
async function handlePrompt(
  ws: WebSocket,
  session: ConversationRelaySession,
  message: CRPromptMessage
): Promise<void> {
  // Log raw message para diagnosticar campos de Twilio CR
  console.log(`[CR] [${session.callSid}] Raw prompt:`, JSON.stringify(message));
  const userText = message.voicePrompt || message.voiceInput || message.transcript || message.text || '';
  if (!userText.trim()) return;

  console.log(`[CR] [${session.callSid}] Usuario: ${userText}`);

  // F6 (A-F6-24): límites del agente, no constantes del handler.
  const maxTurns = session.runtime?.maxTurns ?? 20;
  const maxDurationSeconds = session.runtime?.maxDurationSeconds ?? 600;
  const elapsed = (Date.now() - session.startedAt.getTime()) / 1000;
  const userTurns = session.turns.filter((t) => t.role === 'user').length;
  if (userTurns >= maxTurns || elapsed >= maxDurationSeconds) {
    const cierre =
      'Le agradezco su tiempo. Dejo la conversación registrada y un asesor le contactará. Que tenga buen día.';
    session.turns.push({ role: 'assistant', content: cierre, at: new Date().toISOString() });
    sendText(ws, cierre, true);
    sendEnd(ws);
    return;
  }

  // Agregar mensaje del usuario al historial
  session.messages.push({ role: 'user', content: userText });
  session.turns.push({ role: 'user', content: userText, at: new Date().toISOString() });

  await runModelTurn(ws, session, 0);
}

/**
 * Un turno del modelo: abre el stream por el adaptador compartido, manda el
 * texto a ConversationRelay por cláusulas (latencia baja: no se espera a la
 * respuesta completa) y, si el modelo pide herramientas, las ejecuta y vuelve
 * a llamarlo con los resultados.
 *
 * Si el modelo configurado falla al abrir el stream, `openModelStream` responde
 * con `EMERGENCY_MODEL` y lo deja en el log con el prefijo `[CR]`. La frase de
 * error solo se dice si fallan los dos.
 */
async function runModelTurn(ws: WebSocket, session: ConversationRelaySession, depth: number): Promise<void> {
  let fullResponse = '';
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let sentAny = false;

  // Modelo del agente (ai_settings/agente → entorno → default, resuelto en agentRuntime).
  const model = session.runtime?.model || process.env.OPENAI_CHAT_MODEL || 'gpt-4o';

  try {
    const stream = await openModelStream({
      model,
      messages: toAdapterMessages(session.messages),
      tools: depth < MAX_TOOL_ROUNDS ? sessionTools(session) : [],
      // F-NEW-14: la longitud de la respuesta la modula la organización
      // (`voice_agents.guardrails.max_response_tokens`), ya no es una constante.
      maxTokens: session.runtime?.maxResponseTokens ?? 200,
      // El adaptador solo la envía si el modelo la admite.
      temperature: session.runtime?.temperature ?? 0.7,
      logTag: `[CR] [${session.callSid}]`,
    });
    if (stream.model !== model) {
      console.warn(`[CR] [${session.callSid}] Turno respondido con el modelo de respaldo ${stream.model}`);
    }

    let currentTokenBatch = '';

    for await (const chunk of stream.chunks) {
      if (chunk.delta) {
        fullResponse += chunk.delta;
        currentTokenBatch += chunk.delta;

        // Enviar texto en lotes por cláusula (al encontrar punto, coma o signo)
        if (/[.!?,:;]\s/.test(currentTokenBatch)) {
          sendText(ws, currentTokenBatch, false);
          sentAny = true;
          currentTokenBatch = '';
        }
      }
      if (chunk.toolCall) toolCalls.push(chunk.toolCall);
    }

    // Cierre de la frase: si ya se mandaron trozos, Twilio necesita `last: true`
    // aunque el resto esté vacío; si no, la frase queda abierta.
    if (currentTokenBatch.trim() || sentAny) {
      sendText(ws, currentTokenBatch, true);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CR] [${session.callSid}] Error en el modelo (incluido el respaldo): ${errMsg}`);
    sendText(
      ws,
      depth === 0
        ? 'Disculpe, tuve un problema procesando su solicitud. ¿Puede repetir?'
        : 'Disculpe, ocurrió un error procesando la acción.'
    );
    return;
  }

  if (toolCalls.length > 0) {
    // El texto que el modelo dijo antes de pedir la herramienta también es un turno.
    await handleToolCalls(ws, session, toolCalls, fullResponse, depth);
    return;
  }

  // Guardar respuesta en historial
  if (fullResponse) {
    session.messages.push({ role: 'assistant', content: fullResponse });
    session.turns.push({ role: 'assistant', content: fullResponse, at: new Date().toISOString() });
    console.log(`[CR] [${session.callSid}] Agente${depth > 0 ? ' (post-tool)' : ''}: ${fullResponse}`);
  }
}

/**
 * Ejecuta tool calls y vuelve a llamar al modelo con los resultados.
 */
async function handleToolCalls(
  ws: WebSocket,
  session: ConversationRelaySession,
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
  precedingText: string,
  depth: number
): Promise<void> {
  // C-13: el mensaje del asistente lleva SUS `tool_calls`; sin ellos el historial
  // que se envía al modelo es inválido y la API responde 400.
  session.messages.push({
    role: 'assistant',
    content: precedingText,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.arguments || '{}' },
    })),
  });
  if (precedingText) {
    session.turns.push({ role: 'assistant', content: precedingText, at: new Date().toISOString() });
  }

  const runtime = session.runtime;

  for (const tc of toolCalls) {
    console.log(`[CR] Function call: ${tc.name}`, tc.arguments);

    let args: Record<string, unknown> = {};
    try {
      args = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch (err) {
      console.error('[CR] Argumentos de tool inválidos:', tc.arguments, err);
    }

    let result: string;
    if (runtime) {
      // F6: herramientas del CRM, acotadas por el agente y por la etapa del embudo.
      const toolResult = await executeCrmTool(
        tc.name,
        args,
        {
          orgId: session.orgId,
          supabase: getServiceSupabase(),
          voiceAgentCallId: runtime.voiceAgentCallId,
          customerId: runtime.customerId,
          opportunityId: runtime.opportunityId,
          actionPolicy: runtime.actionPolicy,
        },
        runtime.allowedTools
      );
      result = JSON.stringify(toolResult);
      if (toolResult.say) sendText(ws, toolResult.say, true);
      if (tc.name === 'end_call' && toolResult.success) {
        session.turns.push({ role: 'tool', content: result, at: new Date().toISOString(), tool: tc.name });
        sendEnd(ws);
        return;
      }
    } else {
      result = await executeToolCall(tc.name, args, session.orgId);
    }

    session.messages.push({ role: 'tool', content: result, tool_call_id: tc.id, name: tc.name });
    session.turns.push({ role: 'tool', content: result, at: new Date().toISOString(), tool: tc.name });
  }

  // Respuesta con los resultados, también en streaming (antes era una llamada
  // sin stream: el cliente esperaba la respuesta completa en silencio).
  await runModelTurn(ws, session, depth + 1);
}

// ─── Errores de Twilio (TTS) ────────────────────────────

/**
 * `{"type":"error"}` de ConversationRelay. Si es un fallo de TTS (64111/64112)
 * y el TwiML declaró voz de respaldo, se cambia a ella UNA vez y se reenvía la
 * frase que no sonó. Ver `voiceAgent/ttsFallback.ts`.
 */
function handleRelayError(
  ws: WebSocket,
  tts: TtsFallbackTracker | null,
  session: ConversationRelaySession | null,
  message: CRErrorMessage
): void {
  const description = message.description ?? '';
  const code = twilioErrorCode(description);
  const callSid = session?.callSid ?? 'sin-sesión';
  if (!isTtsError(description)) {
    console.error(`[CR] [${callSid}] Error de Twilio (code ${code ?? 'n/d'}): ${description.substring(0, 300)}`);
    return;
  }

  const cambio = tts?.onTtsError() ?? null;
  if (!cambio) {
    console.error(
      `[CR] [${callSid}] Fallo de TTS (code ${code ?? 'n/d'}) ` +
        (tts?.hasSwitched ? 'también con la voz de respaldo' : 'sin voz de respaldo declarada en el TwiML') +
        `: ${description.substring(0, 300)}`
    );
    return;
  }

  console.error(
    `[CR] [${callSid}] Fallo de TTS con la voz configurada (code ${code ?? 'n/d'}, org ${session?.orgId ?? 'n/d'}, ` +
      `voz ${session?.runtime?.voice.ttsProvider ?? 'n/d'}:${session?.runtime?.voice.voice ?? 'n/d'}). ` +
      `Se cambia a la voz de respaldo (ttsLanguage=${cambio.switchMessage.ttsLanguage}). Revisar la voz del agente.`
  );
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(cambio.switchMessage));
  if (cambio.resend) {
    // Directo, sin `sendText`: no es texto nuevo, es el que no sonó.
    ws.send(JSON.stringify({ type: 'text', token: cambio.resend, last: cambio.resendIsComplete }));
  }
}

// ─── Fin de sesión ──────────────────────────────────────

async function endSession(session: ConversationRelaySession): Promise<void> {
  if (!session.isActive) return;
  session.isActive = false;
  session.silencio?.detener();

  const duration = Math.ceil((Date.now() - session.startedAt.getTime()) / 60000);

  const sb = getServiceSupabase();

  // El libro privado calcula la diferencia, comprueba el débito y sella una vez.
  // Un saldo insuficiente conserva la deuda y la fecha del primer cierre.
  try {
    const resultado = await conciliarSesionCreditoVoz(sb, session.orgId, session.callSid, new Date().toISOString(), session.messages.length);
    if (!resultado.settled) console.warn('[CR] Voz pendiente de conciliación:', { org: session.orgId, minutosPendientes: resultado.minutes_due });
  } catch (error) {
    console.error('[CR] No se pudo conciliar la sesión de voz:', error instanceof Error ? error.message : error, { org: session.orgId });
  }

  // F6: la conversación se guarda en `voice_agent_calls` (antes no se escribía nada
  // y la fila no salía nunca de `in_progress`).
  if (session.runtime?.voiceAgentCallId) {
    await persistConversation(
      sb,
      session.orgId,
      session.runtime.voiceAgentCallId,
      session.turns,
      {
        duration_seconds: Math.max(1, Math.round((Date.now() - session.startedAt.getTime()) / 1000)),
      },
      session.callSid
    );
  }

  activeSessions.delete(session.callSid);
  console.log(`[CR] Sesión finalizada: ${session.callSid} (${duration} min, ${session.messages.length} msgs)`);
}

// ─── Helpers de envío ───────────────────────────────────

/** Envía texto a Twilio para TTS */
function sendText(ws: WebSocket, text: string, last = true): void {
  if (ws.readyState !== 1) return; // WebSocket.OPEN = 1
  ws.send(JSON.stringify({ type: 'text', token: text, last }));
  ttsTrackers.get(ws)?.recordSent(text, last);
}

/** Señala fin de conversación a Twilio */
function sendEnd(ws: WebSocket): void {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'end' }));
}

// ─── Contexto del agente ────────────────────────────────

async function buildAgentContext(orgId: number): Promise<VoiceAgentContext> {
  const sb = getServiceSupabase();
  // F-NEW-8: las dos lecturas comprueban su error y lo propagan con el mensaje real.
  // `organizations` no tiene `business_type`: el tipo de negocio es
  // `organization_types.name` por `type_id`. Pedir la columna inexistente hacía
  // fallar esta lectura, y con ella todo el flujo genérico (sin agente del CRM).
  const { data: org, error: orgError } = await sb
    .from('organizations')
    .select('name, organization_types(name)')
    .eq('id', orgId)
    .maybeSingle();
  if (orgError) throw new Error(`organizations: ${orgError.message}`);

  const { data: settings, error: settingsError } = await sb
    .from('comm_settings')
    .select('voice_agent_config')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (settingsError) throw new Error(`comm_settings: ${settingsError.message}`);
  const voiceConfig = (settings?.voice_agent_config || {}) as Record<string, string>;

  return {
    organizationName: org?.name || 'Negocio',
    organizationType: tipoDeNegocio(org) || 'hotel',
    language: voiceConfig.language || 'es',
    tone: voiceConfig.tone || 'profesional',
    customRules: voiceConfig.customRules || '',
    enabledModules: voiceConfig.enabledModules
      ? (voiceConfig.enabledModules as unknown as string[])
      : ['pms'],
  };
}

/**
 * Busca org por número telefónico configurado en comm_settings.
 * F0 (C-G/C11): sin fallback "primera org activa" — si no hay match, null.
 */
async function findOrgByNumber(phoneNumber: string): Promise<number | null> {
  if (!phoneNumber) return null;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from('comm_settings')
    .select('organization_id')
    .eq('phone_number', phoneNumber)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  // F-NEW-8: un fallo de lectura no puede confundirse con «no hay organización».
  if (error) {
    console.error('[CR] findOrgByNumber falló:', error.message, error.code ?? '');
    return null;
  }

  return (data as { organization_id?: number } | null)?.organization_id ?? null;
}

// ─── API pública ────────────────────────────────────────

export function getActiveRelaySessions(): { callSid: string; orgId: number; duration: number }[] {
  return Array.from(activeSessions.values()).map((s) => ({
    callSid: s.callSid,
    orgId: s.orgId,
    duration: Math.ceil((Date.now() - s.startedAt.getTime()) / 60000),
  }));
}
