/**
 * GO Assistant — adaptador de OpenAI.
 *
 * **Por qué existe.** Los modelos `gpt-5.x` / `gpt-6.x` NO funcionan con Chat
 * Completions: rechazan `max_tokens` con
 * `Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens'`, y hay
 * que llamarlos por la **Responses API**. Los modelos legacy (`gpt-4o` y
 * anteriores) van por Chat Completions.
 *
 * Esto ya estaba verificado y documentado en la Edge Function
 * `ai-auto-response`, pero la lógica vivía allí, en Deno, sin herramientas ni
 * streaming. La primera versión del asistente llamó a Chat Completions con el
 * modelo de la organización (`gpt-5.6-luna`) y **fallaba en la primera llamada,
 * siempre**: el usuario veía "No pude completar la respuesta".
 *
 * Este archivo unifica las dos formas detrás de una sola interfaz, con
 * streaming y tool calling, para que el resto del agente no tenga que saber por
 * qué endpoint va cada modelo.
 */

import OpenAI from 'openai';
import type { JsonSchemaObject } from './types';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY environment variable');
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * Qué endpoint usa un modelo.
 *
 * Mismo criterio que `usaResponsesApi` en `supabase/functions/ai-auto-response`:
 * si se cambia aquí, hay que cambiarlo allí. Vale la pena repetir el regex —son
 * dos runtimes distintos, Node y Deno— antes que inventar un paquete compartido
 * para una línea.
 */
export function usesResponsesApi(model: string): boolean {
  return /^gpt-(5|6)/.test(model);
}

/**
 * Modelo de emergencia: legacy, comprobado que responde por Chat Completions.
 * Si el modelo configurado no tiene acceso en la cuenta, es preferible
 * responder con este y dejar el fallo en el log que dejar mudo al asistente
 * (§3.1 del plan).
 */
export const EMERGENCY_MODEL = 'gpt-4o-mini';

export interface AdapterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Solo en `assistant`: herramientas que el modelo pidió llamar. */
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  /** Solo en `tool`: a qué llamada responde. */
  toolCallId?: string;
}

export interface AdapterTool {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export interface AdapterChunk {
  /** Texto nuevo. */
  delta?: string;
  /** Llamada a herramienta completa (solo cuando ya tiene todos sus argumentos). */
  toolCall?: { id: string; name: string; arguments: string };
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AdapterRequest {
  model: string;
  messages: AdapterMessage[];
  tools: AdapterTool[];
  temperature: number;
  maxTokens: number;
}

export interface AdapterStream {
  /** Modelo que realmente respondió (puede ser el de emergencia). */
  model: string;
  chunks: AsyncIterable<AdapterChunk>;
}

// ─── Chat Completions (modelos legacy) ──────────────────────────────────────

function toChatMessages(messages: AdapterMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content ?? '' };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: 'function' as const,
          function: { name: t.name, arguments: t.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content ?? '' } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  });
}

async function* chatCompletionsStream(req: AdapterRequest): AsyncGenerator<AdapterChunk> {
  const openai = getOpenAIClient();
  const stream = await openai.chat.completions.create({
    model: req.model,
    messages: toChatMessages(req.messages),
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    ...(req.tools.length > 0
      ? {
          tools: req.tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters as unknown as Record<string, unknown> },
          })),
          tool_choice: 'auto' as const,
        }
      : {}),
  });

  // Los `tool_calls` llegan troceados: el índice identifica cuál se completa.
  const pending = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    if (chunk.usage) {
      yield {
        usage: {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        },
      };
    }
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;
    if (delta.content) yield { delta: delta.content };
    for (const call of delta.tool_calls ?? []) {
      const slot = pending.get(call.index) ?? { id: '', name: '', args: '' };
      if (call.id) slot.id = call.id;
      if (call.function?.name) slot.name = call.function.name;
      if (call.function?.arguments) slot.args += call.function.arguments;
      pending.set(call.index, slot);
    }
  }

  for (const call of pending.values()) {
    if (call.name) yield { toolCall: { id: call.id, name: call.name, arguments: call.args || '{}' } };
  }
}

// ─── Responses API (gpt-5.x / gpt-6.x) ──────────────────────────────────────

/**
 * Traduce al formato de la Responses API.
 *
 * Las diferencias que importan:
 * - El `system` va aparte, en `instructions`.
 * - Las herramientas son planas: `{type:'function', name, description, parameters}`,
 *   sin el nivel `function` que usa Chat Completions.
 * - Los resultados de herramienta son items `function_call_output`, no mensajes
 *   con rol `tool`.
 */
function toResponsesInput(messages: AdapterMessage[]): {
  instructions: string | undefined;
  input: Array<Record<string, unknown>>;
} {
  const system = messages.find((m) => m.role === 'system');
  const input: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: m.toolCallId ?? '',
        output: m.content ?? '',
      });
      continue;
    }

    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      for (const t of m.toolCalls) {
        input.push({ type: 'function_call', call_id: t.id, name: t.name, arguments: t.arguments });
      }
      continue;
    }

    if (m.content) input.push({ role: m.role, content: m.content });
  }

  return { instructions: system?.content ?? undefined, input };
}

async function* responsesStream(req: AdapterRequest): AsyncGenerator<AdapterChunk> {
  const openai = getOpenAIClient();
  const { instructions, input } = toResponsesInput(req.messages);

  const stream = await openai.responses.create({
    model: req.model,
    instructions,
    input: input as never,
    temperature: req.temperature,
    max_output_tokens: req.maxTokens,
    // Respuestas de chat: no se quiere que gaste tokens razonando.
    reasoning: { effort: 'none' } as never,
    // Datos de clientes: no se guardan en OpenAI (ANEXO-B §4.2).
    store: false,
    stream: true,
    ...(req.tools.length > 0
      ? {
          tools: req.tools.map((t) => ({
            type: 'function' as const,
            name: t.name,
            description: t.description,
            parameters: t.parameters as unknown as Record<string, unknown>,
            strict: false,
          })) as never,
          tool_choice: 'auto' as const,
        }
      : {}),
  });

  for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
    const type = String(event.type ?? '');

    if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
      yield { delta: event.delta };
      continue;
    }

    // La llamada a herramienta llega completa en `output_item.done`.
    if (type === 'response.output_item.done') {
      const item = event.item as Record<string, unknown> | undefined;
      if (item && item.type === 'function_call') {
        yield {
          toolCall: {
            id: String(item.call_id ?? item.id ?? ''),
            name: String(item.name ?? ''),
            arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
          },
        };
      }
      continue;
    }

    if (type === 'response.completed') {
      const usage = (event.response as Record<string, unknown> | undefined)?.usage as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      if (usage) {
        yield {
          usage: {
            promptTokens: usage.input_tokens ?? 0,
            completionTokens: usage.output_tokens ?? 0,
          },
        };
      }
    }
  }
}

// ─── Puerta única ───────────────────────────────────────────────────────────

/**
 * Abre el stream con el endpoint que corresponda al modelo.
 *
 * Si el modelo configurado falla al ABRIR el stream —sin acceso en la cuenta,
 * cuota agotada, nombre equivocado—, se reintenta con el modelo de emergencia y
 * queda en el log. No se reintenta el mismo modelo por el otro endpoint: está
 * verificado que `gpt-5.6-luna` rechaza Chat Completions, así que ese respaldo
 * no salvaría nada.
 *
 * Solo se cubre el fallo de APERTURA. Si el stream se corta a mitad, quien llama
 * ya tiene texto y reintentar cobraría el turno dos veces.
 */
export async function openModelStream(req: AdapterRequest): Promise<AdapterStream> {
  const primary = usesResponsesApi(req.model) ? responsesStream : chatCompletionsStream;

  try {
    const iterator = primary(req);
    // Se pide el primer trozo aquí para que un 400 del proveedor salte ahora y
    // no a mitad del stream, cuando ya no se puede cambiar de modelo.
    const first = await iterator.next();
    return { model: req.model, chunks: prepend(first, iterator) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `[GO Assistant] El modelo ${req.model} falló al abrir el stream (${detail}). ` +
        `Se responde con ${EMERGENCY_MODEL}. Revisar acceso al modelo en la cuenta de OpenAI.`
    );
    const fallback = chatCompletionsStream({ ...req, model: EMERGENCY_MODEL });
    return { model: EMERGENCY_MODEL, chunks: fallback };
  }
}

/** Vuelve a poner delante el primer trozo que se consumió para validar. */
async function* prepend(
  first: IteratorResult<AdapterChunk>,
  rest: AsyncGenerator<AdapterChunk>
): AsyncGenerator<AdapterChunk> {
  if (!first.done) yield first.value;
  for (;;) {
    const next = await rest.next();
    if (next.done) return;
    yield next.value;
  }
}
