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
import { AgrupadorTrozos } from '@/lib/services/crm/voiceAgent/trozosVoz';
import {
  ControlCierre,
  DESPEDIDA_POR_DEFECTO,
  EsperaReproduccion,
  esDespedida,
  esFinDeHablaAgente,
  esInicioDeHablaAgente,
  esperaMaximaReproduccionMs,
  MENSAJE_EXIGIR_REINTENTO,
  pendienteReproduccion,
  type CRInfoMessage,
  type TipoObjecion,
} from '@/lib/services/crm/voiceAgent/cierreLlamada';
import { marcarPerdidaPorDesinteres } from '@/lib/services/crm/voiceAgent/perdidaPorDesinteres';

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

/**
 * Mensaje cuando el usuario interrumpe al agente. Twilio detiene el TTS y dice
 * hasta dónde alcanzó a sonar; el historial lo lleva la aplicación.
 */
interface CRInterruptMessage {
  type: 'interrupt';
  utteranceUntilInterrupt?: string;
  durationUntilInterruptMs?: number;
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

type CRInboundMessage =
  | CRSetupMessage
  | CRPromptMessage
  | CRInterruptMessage
  | CRDtmfMessage
  | CRErrorMessage
  | CRInfoMessage;

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
  /**
   * Turno del modelo vigente. Una interrupción o un prompt nuevo lo incrementan
   * y el turno anterior deja de mandar texto (no se habla encima de la persona
   * ni se dice una respuesta a una pregunta que ya cambió).
   */
  generacion: number;
  /** Última interrupción: qué turno cortó y lo que alcanzó a sonar (`utteranceUntilInterrupt`). */
  interrupcion?: { generacion: number; oido: string | null } | null;
  /**
   * Cuándo llegó el último prompt final de la persona (ms epoch). Mide lo que
   * ella oye como espera: desde que Twilio cierra su turno hasta que sale el
   * primer texto hacia el TTS, incluidas las vueltas de herramientas.
   */
  promptRecibidoEn?: number;
  /** Ya se registró la espera del prompt vigente (se mide una vez por prompt). */
  esperaRegistrada?: boolean;
  /** Objeciones de desinterés y bajas: tope de un reintento (`voiceAgent/cierreLlamada.ts`). */
  cierre: ControlCierre;
  /** Lo que el agente mandó al TTS desde el último turno del cliente (para saber si ya se despidió). */
  habladoTurno: string[];
  /** ConversationRelay manda eventos `agentSpeaking` (TwiML con `events="speaker-events"`). */
  eventosHabla: boolean;
  /** Según el último `agentSpeaking`: el agente está sonando ahora. */
  agenteHablando: boolean;
  /** Despedida sonando antes de colgar: los turnos que lleguen ya no se contestan. */
  colgando: boolean;
  /** Espera de fin de reproducción en curso (se cancela si el socket se cierra). */
  espera?: EsperaReproduccion | null;
  /** La pérdida por desinterés definitivo ya se intentó (una vez por llamada). */
  perdidaProcesada?: boolean;
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
          if (!claims || (upgradeClaims && upgradeClaims.orgId !== claims.orgId)) {
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
          // El usuario interrumpió: se corta el turno en curso y el historial
          // queda con lo que de verdad sonó. Está hablando: el conteo de
          // silencio vuelve a empezar.
          console.log(`[CR] Interrupción en ${session?.callSid} (${message.durationUntilInterruptMs ?? 'n/d'} ms)`);
          if (session) registrarInterrupcion(session, message.utteranceUntilInterrupt);
          session?.silencio?.reiniciar();
          break;

        case 'dtmf':
          console.log(`[CR] DTMF: ${message.digit} en ${session?.callSid}`);
          break;

        case 'info':
          // `events="speaker-events"`: cuándo empieza y termina de sonar el agente.
          if (session) registrarInfoHabla(session, message);
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
    if (session) {
      // La persona colgó (o Twilio cerró): no hay despedida que esperar.
      session.espera?.cancelar();
      endSession(session);
    }
  });

  ws.on('error', (error) => {
    console.error('[CR] WebSocket error:', error);
    if (session) {
      endSession(session);
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

  if (commSettings.voice_minutes_remaining !== null && commSettings.voice_minutes_remaining <= 0) {
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
    } catch (err) {
      // No se traga el fallo: se registra con su mensaje real y se cae al flujo genérico.
      console.error('[CR] No se pudo cargar el agente del CRM:', err instanceof Error ? err.message : err);
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
    generacion: 0,
    cierre: new ControlCierre(),
    habladoTurno: [],
    eventosHabla: false,
    agenteHablando: false,
    colgando: false,
  };

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
      decir(ws, session, FRASE_CIERRE_SILENCIO);
      void colgarConDespedida(ws, session, 'silencio');
    },
  });

  // Log inicio de sesión
  const usageInsert = await sb.from('comm_usage_logs').insert({
    organization_id: orgId,
    channel: 'voice',
    credits_used: 0,
    twilio_message_sid: callSid,
    recipient: from,
    status: 'in_progress',
    direction: runtime ? 'outbound' : 'inbound',
    module: 'voice_agent',
    metadata: {
      type: 'conversation_relay_session',
      startedAt: new Date().toISOString(),
      voice_agent_id: runtime?.agent.id ?? null,
      voice_agent_call_id: runtime?.voiceAgentCallId ?? null,
      stage_objective: runtime?.stage?.objective ?? null,
    },
  });
  // No se traga el fallo: sin este registro no hay traza de coste de la sesión.
  if (usageInsert.error) {
    console.error('[CR] comm_usage_logs insert falló:', usageInsert.error.message);
  }

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
  const recibidoEn = Date.now();
  // Log raw message para diagnosticar campos de Twilio CR
  console.log(`[CR] [${session.callSid}] Raw prompt:`, JSON.stringify(message));
  const userText = message.voicePrompt || message.voiceInput || message.transcript || message.text || '';
  if (!userText.trim()) return;
  // Despedida sonando: la llamada ya terminó, no se contesta nada más.
  if (session.colgando) return;
  session.habladoTurno = [];

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
    decir(ws, session, cierre);
    await colgarConDespedida(ws, session, 'limite');
    return;
  }

  // Un prompt nuevo deja sin efecto el turno anterior si aún estaba hablando.
  const generacion = ++session.generacion;
  session.promptRecibidoEn = recibidoEn;
  session.esperaRegistrada = false;

  // Agregar mensaje del usuario al historial
  session.messages.push({ role: 'user', content: userText });
  session.turns.push({ role: 'user', content: userText, at: new Date().toISOString() });

  await runModelTurn(ws, session, 0, generacion);
}

/**
 * Interrupción (`{type:'interrupt'}`): ConversationRelay corta el TTS pero no
 * lleva el historial. Sin esto el modelo creía haber dicho la frase completa
 * (p. ej. la presentación) y la conversación se desfasaba.
 *  - Si el turno del modelo sigue en curso, se corta (`generacion`) y guardará
 *    solo lo que sonó.
 *  - Si ya había terminado, el último mensaje del asistente se recorta a lo
 *    que sonó.
 */
export function registrarInterrupcion(session: ConversationRelaySession, utterance: string | null | undefined): void {
  const oido = (utterance ?? '').trim();
  session.interrupcion = { generacion: session.generacion, oido: oido || null };
  session.generacion++;
  if (!oido) return;
  const ultimo = session.messages[session.messages.length - 1];
  if (ultimo && ultimo.role === 'assistant' && !ultimo.tool_calls?.length && ultimo.content && ultimo.content !== oido) {
    ultimo.content = oido;
  }
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
async function runModelTurn(
  ws: WebSocket,
  session: ConversationRelaySession,
  depth: number,
  generacion: number = session.generacion
): Promise<void> {
  let fullResponse = '';
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let sentAny = false;
  let interrumpido = false;
  /** Dónde va la respuesta en el historial si un prompt nuevo llega antes de que termine. */
  const indiceRespuesta = session.messages.length;
  const inicio = Date.now();
  let primerTokenMs: number | null = null;
  let primerTrozoMs: number | null = null;
  let uso: { promptTokens: number; completionTokens: number; cachedTokens?: number } | null = null;
  const trozos = new AgrupadorTrozos();
  /** Manda un trozo a Twilio y anota cuándo salió el primero. */
  const enviar = (texto: string, last: boolean) => {
    if (primerTrozoMs === null && texto) {
      primerTrozoMs = Date.now() - inicio;
      if (!session.esperaRegistrada && session.promptRecibidoEn) {
        session.esperaRegistrada = true;
        console.log(
          `[CR] [${session.callSid}] Espera percibida: ${Date.now() - session.promptRecibidoEn} ms ` +
            'desde el prompt final hasta el primer texto enviado a Twilio'
        );
      }
    }
    sendText(ws, texto, last);
  };

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
      // Mismo agente → mismo servidor de caché: el prefijo estable del prompt
      // (guardarraíles, instrucciones, herramientas) se lee de caché.
      promptCacheKey: `voz:${session.orgId}:${session.runtime?.agent.id ?? 'generico'}`,
    });
    if (stream.model !== model) {
      console.warn(`[CR] [${session.callSid}] Turno respondido con el modelo de respaldo ${stream.model}`);
    }

    // Latencia (2026-10-07): el texto sale hacia ConversationRelay mientras el
    // modelo genera (`last:false`), sin esperar a la frase, pero en trozos de
    // 2–3 palabras COMPLETAS (`AgrupadorTrozos`): token a token la voz sonaba
    // entrecortada. Antes de 435052e5 se esperaba a cerrar una cláusula y en
    // una pregunta sin comas la voz no arrancaba hasta tener la frase entera.
    for await (const chunk of stream.chunks) {
      if (session.generacion !== generacion) {
        // Interrumpido o reemplazado por un prompt nuevo: se deja de hablar.
        interrumpido = true;
        break;
      }
      if (chunk.delta) {
        if (primerTokenMs === null) primerTokenMs = Date.now() - inicio;
        fullResponse += chunk.delta;
        const trozo = trozos.agregar(chunk.delta);
        if (trozo) {
          enviar(trozo, false);
          sentAny = true;
        }
      }
      if (chunk.toolCall) toolCalls.push(chunk.toolCall);
      if (chunk.usage) uso = chunk.usage;
    }

    // Cierre de la frase con lo que quede en el agrupador. Si ya se mandaron
    // trozos, Twilio necesita `last: true` aunque el resto sea vacío; si no, la
    // frase queda abierta.
    if (!interrumpido) {
      const resto = trozos.vaciar();
      if (sentAny || resto) enviar(resto, true);
    }
    console.log(
      `[CR] [${session.callSid}] Latencia del modelo: primer token ${primerTokenMs ?? 'n/d'} ms, ` +
        `primer trozo a Twilio ${primerTrozoMs ?? 'n/d'} ms, ` +
        `respuesta completa ${Date.now() - inicio} ms${interrumpido ? ' (interrumpido)' : ''}` +
        (uso
          ? ` · tokens entrada ${uso.promptTokens} (en caché ${uso.cachedTokens ?? 0}), salida ${uso.completionTokens}`
          : '')
    );
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

  if (interrumpido) {
    // Al historial va lo que la persona alcanzó a oír, no lo que se generó, y
    // en SU sitio (justo tras lo que lo motivó), aunque el prompt nuevo ya se
    // haya añadido detrás.
    const oido = (session.interrupcion?.generacion === generacion ? session.interrupcion.oido : null) || fullResponse;
    if (oido) {
      session.messages.splice(indiceRespuesta, 0, { role: 'assistant', content: oido });
      session.turns.push({ role: 'assistant', content: oido, at: new Date().toISOString() });
    }
    return;
  }

  if (fullResponse) session.habladoTurno.push(fullResponse);

  if (toolCalls.length > 0) {
    // El texto que el modelo dijo antes de pedir la herramienta también es un turno.
    await handleToolCalls(ws, session, toolCalls, fullResponse, depth, generacion);
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
  depth: number,
  generacion: number
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
  /** Índice del turno vigente del cliente: una objeción de desinterés cuenta una vez por turno. */
  const turnoCliente = session.turns.filter((t) => t.role === 'user').length;
  const ultimoTextoCliente = [...session.turns].reverse().find((t) => t.role === 'user')?.content ?? null;

  for (const tc of toolCalls) {
    console.log(`[CR] Function call: ${tc.name}`, tc.arguments);

    let args: Record<string, unknown> = {};
    try {
      args = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch (err) {
      console.error('[CR] Argumentos de tool inválidos:', tc.arguments, err);
    }

    let result: string;
    if (runtime && tc.name === 'end_call' && session.cierre.decidirEndCall(ultimoTextoCliente).accion === 'exigir_reintento') {
      // Primera objeción de desinterés: el agente no cuelga sin su ÚNICO
      // reintento. Se rechaza este `end_call` (una sola vez por llamada).
      console.log(`[CR] [${session.callSid}] end_call rechazado: falta el único reintento ante el desinterés`);
      result = JSON.stringify({ success: false, error: MENSAJE_EXIGIR_REINTENTO });
    } else if (runtime) {
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
      if (toolResult.say) decir(ws, session, toolResult.say);
      if (tc.name === 'log_objection' && toolResult.success) {
        const data = (toolResult.data ?? {}) as { objection?: string; tipo?: TipoObjecion };
        session.cierre.registrarObjecion(turnoCliente, {
          texto: String(data.objection ?? args.objection ?? ''),
          detalle: typeof args.detail === 'string' ? args.detail : null,
          tipo: data.tipo ?? 'otro',
        });
      }
      if (tc.name === 'log_consent_opt_out' && toolResult.success) session.cierre.registrarBaja();
      if (tc.name === 'end_call' && toolResult.success) {
        session.turns.push({ role: 'tool', content: result, at: new Date().toISOString(), tool: tc.name });
        await colgarConDespedida(ws, session, 'end_call');
        return;
      }
    } else {
      result = await executeToolCall(tc.name, args, session.orgId);
    }

    session.messages.push({ role: 'tool', content: result, tool_call_id: tc.id, name: tc.name });
    session.turns.push({ role: 'tool', content: result, at: new Date().toISOString(), tool: tc.name });
  }

  // Desinterés DEFINITIVO (dijo que no después del reintento): el runtime
  // cierra aunque el modelo no haya pedido `end_call`. Nunca hay un segundo
  // reintento: no se le devuelve la palabra al modelo.
  if (runtime && session.cierre.desinteresDefinitivo && !session.colgando) {
    console.log(`[CR] [${session.callSid}] Desinterés definitivo: el runtime cierra la llamada`);
    const fin = await executeCrmTool(
      'end_call',
      { outcome: 'sin_interes_definitivo' },
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
    session.turns.push({ role: 'tool', content: JSON.stringify(fin), at: new Date().toISOString(), tool: 'end_call' });
    await colgarConDespedida(ws, session, 'desinteres_definitivo');
    return;
  }

  // Respuesta con los resultados, también en streaming (antes era una llamada
  // sin stream: el cliente esperaba la respuesta completa en silencio).
  // Si la persona interrumpió mientras corrían las herramientas, sus
  // resultados ya están en el historial pero no se habla encima de ella.
  if (session.generacion !== generacion) return;
  await runModelTurn(ws, session, depth + 1, generacion);
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
  session.espera?.cancelar();

  // Si la persona colgó después de decir que no por segunda vez, el
  // desinterés también es definitivo (no hace falta que el agente cuelgue).
  await procesarPerdida(session);

  const duration = Math.ceil((Date.now() - session.startedAt.getTime()) / 60000);

  const sb = getServiceSupabase();

  // ── Conciliación del crédito (F-NEW-6) ──
  // El despachador RESERVA `voice_agent_calls.credits_reserved` minutos antes de
  // marcar. Antes aquí se cobraban los minutos completos ENCIMA de la reserva:
  // una llamada de 30 s costaba 2 créditos y una de 5 min costaba 6. Ahora se
  // cobra solo la diferencia, y una sola vez (`credits_settled_at`).
  let alreadyReserved = 0;
  let settleRowId: string | null = null;
  if (session.runtime?.voiceAgentCallId) {
    const { data: vac, error: vacError } = await sb
      .from('voice_agent_calls')
      .select('id, credits_reserved, credits_settled_at')
      .eq('id', session.runtime.voiceAgentCallId)
      .eq('organization_id', session.orgId)
      .maybeSingle();
    if (vacError) {
      console.error('[CR] no se pudo leer la reserva de créditos:', vacError.message);
    } else if (vac) {
      const row = vac as { id: string; credits_reserved: number | null; credits_settled_at: string | null };
      if (row.credits_settled_at) {
        // Ya conciliada (cierre duplicado): no se vuelve a cobrar.
        alreadyReserved = duration;
      } else {
        alreadyReserved = row.credits_reserved ?? 0;
        settleRowId = row.id;
      }
    }
  }

  const creditsToCharge = Math.max(0, duration - alreadyReserved);
  // R3-7: el cobro era fail-OPEN. Si `deduct_comm_credits` fallaba se registraba
  // el error y aun así se sellaba `credits_settled_at`, así que la llamada
  // quedaba dada por conciliada y el cobro se perdía para siempre. Ahora el
  // sello depende de que el cobro haya salido bien: si falla, la fila se queda
  // SIN sellar y sigue siendo reconciliable.
  let cobroOk = true;
  if (creditsToCharge > 0) {
    const { error: creditError } = await sb.rpc('deduct_comm_credits', {
      p_org_id: session.orgId,
      p_channel: 'voice',
      p_amount: creditsToCharge,
    });
    if (creditError) {
      cobroOk = false;
      console.error(
        `[CR] deduct_comm_credits falló (org ${session.orgId}, ${creditsToCharge} créditos): ${creditError.message}. ` +
        'La llamada NO se marca como conciliada para que el cobro pueda reintentarse.'
      );
    }
  }

  if (settleRowId && !cobroOk) {
    // No se sella: queda pendiente de conciliar, a propósito.
    settleRowId = null;
  }

  if (settleRowId) {
    const { error: settleError } = await sb
      .from('voice_agent_calls')
      .update({ credits_settled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', settleRowId)
      .eq('organization_id', session.orgId);
    if (settleError) console.error('[CR] no se pudo marcar la conciliación de créditos:', settleError.message);
  }

  // Actualizar log
  const { error: usageError } = await sb
    .from('comm_usage_logs')
    .update({
      status: 'completed',
      credits_used: Math.max(duration, alreadyReserved),
      metadata: {
        type: 'conversation_relay_session',
        startedAt: session.startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        durationMinutes: duration,
        creditsReserved: alreadyReserved,
        creditsChargedAtHangup: creditsToCharge,
        messageCount: session.messages.length,
      },
    })
    .eq('twilio_message_sid', session.callSid)
    .eq('module', 'voice_agent');
  if (usageError) console.error('[CR] comm_usage_logs update falló:', usageError.message);

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
      }
    );
  }

  activeSessions.delete(session.callSid);
  console.log(`[CR] Sesión finalizada: ${session.callSid} (${duration} min, ${session.messages.length} msgs)`);
}

// ─── Cierre: despedida garantizada y pérdida por desinterés ─────

/** `info` de ConversationRelay (`agentSpeaking` on/off). */
export function registrarInfoHabla(session: ConversationRelaySession, message: CRInfoMessage): void {
  if (esInicioDeHablaAgente(message)) {
    session.eventosHabla = true;
    session.agenteHablando = true;
  } else if (esFinDeHablaAgente(message)) {
    session.eventosHabla = true;
    session.agenteHablando = false;
  }
  session.espera?.info(message);
}

/** Manda una frase completa al TTS y la anota como hablada en este turno. */
function decir(ws: WebSocket, session: ConversationRelaySession, texto: string): void {
  sendText(ws, texto, true);
  session.habladoTurno.push(texto);
}

/**
 * Cuelga SIEMPRE con despedida (decisión del dueño, 2026-10-07): si lo último
 * que dijo el agente no fue una despedida, el runtime dice la del agente
 * (`runtime.despedida`); después espera a que termine de sonar —el
 * `agentSpeaking: off` de ConversationRelay o un tope por longitud— y manda
 * `end`. Antes `end` salía en el mismo instante y la llamada se cortaba en
 * silencio (`voice_agent_calls` 6f7d4e15).
 *
 * No aplica cuando la persona cuelga (no hay a quién hablarle: `ws.close`) ni
 * al buzón de voz (AMD cierra la llamada por el callback de estado, sin pasar
 * por aquí). La baja (Ley 2300 / 1581) ya se despide con el `say` de
 * `log_consent_opt_out`, que esta función reconoce como despedida.
 */
async function colgarConDespedida(
  ws: WebSocket,
  session: ConversationRelaySession,
  motivo: 'end_call' | 'desinteres_definitivo' | 'silencio' | 'limite'
): Promise<void> {
  if (session.colgando) return;
  session.colgando = true;
  session.silencio?.detener();
  // Nada que siga en curso puede hablar encima de la despedida.
  session.generacion++;

  const ultimo = session.habladoTurno[session.habladoTurno.length - 1] ?? '';
  let textoNuevo = false;
  let porSonar = ultimo;
  if (!esDespedida(ultimo)) {
    const despedida = session.runtime?.despedida || DESPEDIDA_POR_DEFECTO;
    session.messages.push({ role: 'assistant', content: despedida });
    session.turns.push({ role: 'assistant', content: despedida, at: new Date().toISOString() });
    decir(ws, session, despedida);
    textoNuevo = true;
    porSonar = session.agenteHablando ? session.habladoTurno.join(' ') : despedida;
  }

  const pendiente = pendienteReproduccion({
    textoNuevo,
    eventosHabla: session.eventosHabla,
    agenteHablando: session.agenteHablando,
  });
  const espera = new EsperaReproduccion(pendiente, esperaMaximaReproduccionMs(porSonar));
  session.espera = espera;
  // La pérdida se registra mientras suena la despedida, sin retrasar el cuelgue.
  const perdida = procesarPerdida(session);
  const fin = await espera.terminada;
  console.log(`[CR] [${session.callSid}] Cierre (${motivo}): despedida ${textoNuevo ? 'del runtime' : 'del agente'}, espera ${fin}`);
  sendEnd(ws);
  await perdida;
}

/**
 * Oportunidad a perdida si la llamada terminó con desinterés definitivo
 * (después del reintento) y sin baja. Una vez por llamada. Las condiciones
 * (venta, pipeline de ventas, oportunidad abierta) y el cierre por
 * `opportunityStageService` viven en `voiceAgent/perdidaPorDesinteres.ts`.
 */
async function procesarPerdida(session: ConversationRelaySession): Promise<void> {
  const runtime = session.runtime;
  const objecion = session.cierre.ultimaObjecion;
  if (!runtime || session.perdidaProcesada || !session.cierre.desinteresDefinitivo || !objecion) return;
  session.perdidaProcesada = true;
  try {
    const r = await marcarPerdidaPorDesinteres(
      {
        orgId: session.orgId,
        supabase: getServiceSupabase(),
        voiceAgentCallId: runtime.voiceAgentCallId,
        customerId: runtime.customerId,
        opportunityId: runtime.opportunityId,
        agentId: runtime.agent.id,
        objetivo: runtime.objetivo,
        politicaEtapa: runtime.stage?.actionPolicy ?? null,
      },
      objecion
    );
    console.log(`[CR] [${session.callSid}] Pérdida por desinterés: ${r.aplicada ? 'aplicada' : `no aplicada (${r.motivo})`}`);
  } catch (err) {
    console.error(`[CR] [${session.callSid}] Pérdida por desinterés falló:`, err instanceof Error ? err.message : err);
  }
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
