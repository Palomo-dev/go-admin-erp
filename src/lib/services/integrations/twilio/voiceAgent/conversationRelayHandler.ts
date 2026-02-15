/**
 * ConversationRelay Handler — Maneja sesiones de voz via texto
 * GO Admin ERP
 *
 * Twilio ConversationRelay envía texto (post-STT) y recibe texto (pre-TTS).
 * Este handler conecta esos mensajes con OpenAI Chat Completions + function calling.
 * No requiere OpenAI Realtime API — usa la API estándar con streaming.
 */

import OpenAI from 'openai';
import type WebSocket from 'ws';
import { supabase } from '@/lib/supabase/config';
import { buildVoiceAgentPrompt, type VoiceAgentContext } from './voiceAgentPrompts';
import { VOICE_AGENT_TOOLS, executeToolCall } from './voiceAgentTools';
import { getCommSettings } from '../twilioSubaccounts';
import { commCreditsService } from '@/lib/services/commCreditsService';

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
  voiceInput: string;
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
}

export interface ConversationRelaySession {
  callSid: string;
  orgId: number;
  callerNumber: string;
  messages: ConversationMessage[];
  startedAt: Date;
  isActive: boolean;
}

const activeSessions = new Map<string, ConversationRelaySession>();

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
 */
export function handleConversationRelayConnection(ws: WebSocket): void {
  let session: ConversationRelaySession | null = null;

  ws.on('message', async (data) => {
    try {
      const message: CRInboundMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'setup':
          session = await handleSetup(ws, message);
          break;

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
      console.error('[CR] Error procesando mensaje:', error);
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
  message: CRSetupMessage
): Promise<ConversationRelaySession | null> {
  const { callSid, from, to } = message;
  const orgIdParam = message.customParameters?.orgId;
  const orgId = orgIdParam ? parseInt(orgIdParam, 10) : await findOrgByNumber(to);

  if (!orgId) {
    sendText(ws, 'Lo sentimos, no pudimos identificar la organización. Adiós.');
    sendEnd(ws);
    return null;
  }

  // Verificar Voice Agent habilitado y créditos
  const hasVoice = await commCreditsService.hasVoiceAgent(orgId);
  if (!hasVoice) {
    sendText(ws, 'El asistente virtual no está habilitado para esta organización. Lo transferimos con un agente.');
    sendEnd(ws);
    return null;
  }

  const hasCredits = await commCreditsService.hasCredits(orgId, 'voice');
  if (!hasCredits) {
    sendText(ws, 'No hay minutos disponibles en este momento. Por favor intente más tarde.');
    sendEnd(ws);
    return null;
  }

  // Construir contexto del agente
  const agentContext = await buildAgentContext(orgId);
  const systemPrompt = buildVoiceAgentPrompt(agentContext);

  const session: ConversationRelaySession = {
    callSid,
    orgId,
    callerNumber: from,
    messages: [{ role: 'system', content: systemPrompt }],
    startedAt: new Date(),
    isActive: true,
  };

  activeSessions.set(callSid, session);

  // Log inicio de sesión
  await supabase.from('comm_usage_logs').insert({
    organization_id: orgId,
    channel: 'voice',
    credits_used: 0,
    twilio_message_sid: callSid,
    recipient: from,
    status: 'in_progress',
    direction: 'inbound',
    module: 'voice_agent',
    metadata: { type: 'conversation_relay_session', startedAt: new Date().toISOString() },
  });

  // Saludo inicial
  const greeting = `Hola, gracias por llamar a ${agentContext.organizationName}. ¿En qué puedo ayudarle?`;
  session.messages.push({ role: 'assistant', content: greeting });
  sendText(ws, greeting);

  console.log(`[CR] Sesión iniciada: ${callSid} (org: ${orgId})`);
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
  const userText = message.voiceInput;
  if (!userText.trim()) return;

  console.log(`[CR] [${session.callSid}] Usuario: ${userText}`);

  // Agregar mensaje del usuario al historial
  session.messages.push({ role: 'user', content: userText });

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
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      messages: session.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant' | 'tool',
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      tools: VOICE_AGENT_TOOLS.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      stream: true,
      max_tokens: 200,
      temperature: 0.7,
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
      console.log(`[CR] [${session.callSid}] Agente: ${fullResponse}`);
    }
  } catch (error) {
    console.error('[CR] Error en OpenAI:', error);
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
  // Agregar el mensaje del asistente con tool_calls al historial
  session.messages.push({
    role: 'assistant',
    content: '',
  });

  for (const tc of toolCalls) {
    console.log(`[CR] Function call: ${tc.name}`, tc.arguments);

    const args = JSON.parse(tc.arguments);
    const result = await executeToolCall(tc.name, args, session.orgId);

    // Agregar resultado al historial
    session.messages.push({
      role: 'tool',
      content: result,
      tool_call_id: tc.id,
      name: tc.name,
    });
  }

  // Pedir a OpenAI que genere respuesta con los resultados
  const openai = getOpenAIClient();

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      messages: session.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant' | 'tool',
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      max_tokens: 200,
      temperature: 0.7,
    });

    const assistantMsg = response.choices[0]?.message?.content || '';
    if (assistantMsg) {
      session.messages.push({ role: 'assistant', content: assistantMsg });
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

  // Descontar créditos
  if (duration > 0) {
    await supabase.rpc('deduct_comm_credits', {
      p_org_id: session.orgId,
      p_channel: 'voice',
      p_amount: duration,
    });
  }

  // Actualizar log
  await supabase
    .from('comm_usage_logs')
    .update({
      status: 'completed',
      credits_used: duration,
      metadata: {
        type: 'conversation_relay_session',
        startedAt: session.startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        durationMinutes: duration,
        messageCount: session.messages.length,
      },
    })
    .eq('twilio_message_sid', session.callSid)
    .eq('module', 'voice_agent');

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
  const { data: org } = await supabase
    .from('organizations')
    .select('name, business_type')
    .eq('id', orgId)
    .single();

  const settings = await getCommSettings(orgId);
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

/** Busca org por número telefónico */
async function findOrgByNumber(phoneNumber: string): Promise<number | null> {
  const { data } = await supabase
    .from('comm_settings')
    .select('organization_id')
    .eq('phone_number', phoneNumber)
    .eq('is_active', true)
    .single();

  if (data) return data.organization_id;

  const masterPhone = process.env.TWILIO_PHONE_NUMBER;
  if (phoneNumber === masterPhone) {
    const { data: orgs } = await supabase
      .from('comm_settings')
      .select('organization_id')
      .eq('is_active', true)
      .limit(1)
      .single();
    return orgs?.organization_id || null;
  }

  return null;
}

// ─── API pública ────────────────────────────────────────

export function getActiveRelaySessions(): { callSid: string; orgId: number; duration: number }[] {
  return Array.from(activeSessions.values()).map((s) => ({
    callSid: s.callSid,
    orgId: s.orgId,
    duration: Math.ceil((Date.now() - s.startedAt.getTime()) / 60000),
  }));
}
