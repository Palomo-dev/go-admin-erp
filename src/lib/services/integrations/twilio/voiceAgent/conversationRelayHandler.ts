/**
 * ConversationRelay Handler — Maneja sesiones de voz via texto
 * GO Admin ERP
 *
 * Twilio ConversationRelay envía texto (post-STT) y recibe texto (pre-TTS).
 * Este handler conecta esos mensajes con OpenAI Chat Completions + function calling.
 * No requiere OpenAI Realtime API — usa la API estándar con streaming.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type WebSocket from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { buildVoiceAgentPrompt, type VoiceAgentContext } from './voiceAgentPrompts';
import { VOICE_AGENT_TOOLS, executeToolCall } from './voiceAgentTools';
import { verifyWsSessionToken, type WsSessionClaims } from '@/lib/security/wsSessionToken';
// F6: cuando la llamada trae `agentId`, el cerebro es el del agente del CRM
// (voice_agents + stage_agents), no el recepcionista de hotel.
import {
  buildRuntimeConfig,
  persistConversation,
  type AgentRuntimeConfig,
  type ConversationTurn,
} from '@/lib/services/crm/voiceAgent/agentRuntime';
import { executeTool as executeCrmTool } from '@/lib/services/crm/voiceAgentTools';

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

type CRInboundMessage = CRSetupMessage | CRPromptMessage | CRInterruptMessage | CRDtmfMessage;

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
}

const activeSessions = new Map<string, ConversationRelaySession>();

// ─── Helper para mapear mensajes a OpenAI ───────────────

function mapToOpenAIMessages(messages: ConversationMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id || '' };
    }
    if (m.role === 'assistant') {
      // C-13: los `tool_calls` DEBEN viajar en el mensaje del asistente que precede
      // a los mensajes `role:'tool'`; si se descartan, OpenAI rechaza el historial.
      return m.tool_calls?.length
        ? { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls }
        : { role: 'assistant', content: m.content };
    }
    if (m.role === 'user') {
      return { role: 'user', content: m.content };
    }
    return { role: 'system', content: m.content };
  });
}

// ─── OpenAI Client ──────────────────────────────────────

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY');
  return new OpenAI({ apiKey });
}

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
          session = await handleSetup(ws, message, claims);
          break;
        }

        case 'prompt':
          if (session) {
            await handlePrompt(ws, session, message);
          }
          break;

        case 'interrupt':
          // El usuario interrumpió — detener generación actual
          console.log(`[CR] Interrupción en ${session?.callSid}`);
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
    if (session) {
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
  };

  activeSessions.set(callSid, session);

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
  if (!runtime) sendText(ws, greeting);

  console.log(
    `[CR] Sesión iniciada: ${callSid} (org: ${orgId}, agente: ${runtime?.agent.name ?? 'genérico'}, ` +
      `objetivo: ${runtime?.stage?.objective ?? 'n/d'}, OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'MISSING'})`
  );
  return session;
}

/**
 * Prompt: Twilio envía el texto transcrito del usuario.
 * Procesamos con OpenAI Chat y respondemos con texto.
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

  // Llamar a OpenAI con streaming
  const openai = getOpenAIClient();
  let fullResponse = '';
  let toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }> = [];

  try {
    const stream = await openai.chat.completions.create({
      model: session.runtime?.model || process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      messages: mapToOpenAIMessages(session.messages),
      tools: session.runtime
        ? session.runtime.toolDefinitions
        : VOICE_AGENT_TOOLS.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
      stream: true,
      // F-NEW-14: la longitud de la respuesta la modula la organización
      // (`voice_agents.guardrails.max_response_tokens`), ya no es una constante.
      max_tokens: session.runtime?.maxResponseTokens ?? 200,
      temperature: session.runtime?.temperature ?? 0.7,
    });

    let currentTokenBatch = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Texto normal
      if (delta?.content) {
        fullResponse += delta.content;
        currentTokenBatch += delta.content;

        // Enviar texto en lotes por oración (al encontrar punto, coma o signo)
        const sentenceEnd = currentTokenBatch.match(/[.!?,:;]\s/);
        if (sentenceEnd) {
          sendText(ws, currentTokenBatch, false);
          currentTokenBatch = '';
        }
      }

      // Tool calls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }
    }

    // Enviar último batch de texto
    if (currentTokenBatch.trim()) {
      sendText(ws, currentTokenBatch, true);
    }

    // Si hubo tool calls, ejecutarlas
    if (toolCalls.length > 0) {
      await handleToolCalls(ws, session, toolCalls);
      return;
    }

    // Guardar respuesta en historial
    if (fullResponse) {
      session.messages.push({ role: 'assistant', content: fullResponse });
      session.turns.push({ role: 'assistant', content: fullResponse, at: new Date().toISOString() });
      console.log(`[CR] [${session.callSid}] Agente: ${fullResponse}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[CR] Error en OpenAI: ${errMsg}`);
    console.error('[CR] OpenAI error full:', JSON.stringify(error, null, 2));
    sendText(ws, 'Disculpe, tuve un problema procesando su solicitud. ¿Puede repetir?');
  }
}

/**
 * Ejecuta tool calls y envía el resultado de vuelta a OpenAI.
 */
async function handleToolCalls(
  ws: WebSocket,
  session: ConversationRelaySession,
  toolCalls: Array<{ id: string; name: string; arguments: string }>
): Promise<void> {
  // C-13: el mensaje del asistente lleva SUS `tool_calls`; sin ellos el historial
  // que se envía a OpenAI es inválido y la API responde 400.
  session.messages.push({
    role: 'assistant',
    content: '',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.arguments || '{}' },
    })),
  });

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

  // Pedir a OpenAI que genere respuesta con los resultados
  const openai = getOpenAIClient();

  try {
    const response = await openai.chat.completions.create({
      model: runtime?.model || process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      messages: mapToOpenAIMessages(session.messages),
      max_tokens: runtime?.maxResponseTokens ?? 200,
      temperature: runtime?.temperature ?? 0.7,
    });

    const assistantMsg = response.choices[0]?.message?.content || '';
    if (assistantMsg) {
      session.messages.push({ role: 'assistant', content: assistantMsg });
      session.turns.push({ role: 'assistant', content: assistantMsg, at: new Date().toISOString() });
      sendText(ws, assistantMsg, true);
      console.log(`[CR] [${session.callSid}] Agente (post-tool): ${assistantMsg}`);
    }
  } catch (error) {
    console.error('[CR] Error en OpenAI post-tool:', error);
    sendText(ws, 'Disculpe, ocurrió un error procesando la acción.');
  }
}

// ─── Fin de sesión ──────────────────────────────────────

async function endSession(session: ConversationRelaySession): Promise<void> {
  if (!session.isActive) return;
  session.isActive = false;

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

// ─── Helpers de envío ───────────────────────────────────

/** Envía texto a Twilio para TTS */
function sendText(ws: WebSocket, text: string, last = true): void {
  if (ws.readyState !== 1) return; // WebSocket.OPEN = 1
  ws.send(JSON.stringify({ type: 'text', token: text, last }));
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
  const { data: org, error: orgError } = await sb
    .from('organizations')
    .select('name, business_type')
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
    organizationType: org?.business_type || 'hotel',
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
