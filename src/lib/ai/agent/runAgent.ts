/**
 * GO Assistant — bucle del agente.
 *
 * ```
 * mensaje del usuario
 *   → contexto real de la organización (módulos, sucursal, permisos)
 *   → catálogo filtrado por: nivel × permisos × módulos × canal
 *   → modelo con tool calling y streaming
 *   → por cada tool_call:
 *        risk = low            → execute() directo, resultado al modelo, seguir
 *        risk = medium | high  → preview(), fila `ai_agent_actions` (pending),
 *                                tarjeta al cliente, PAUSAR el turno
 * ```
 *
 * **El turno se pausa, no se aborta** (§5.4). Cuando el usuario confirma, la
 * conversación sigue donde estaba y el modelo recibe el `ToolResult` como si la
 * herramienta hubiera respondido en su momento.
 *
 * Sustituye al parseo de bloques ```action con expresión regular (C5): si el
 * modelo escribía una coma de más, la acción se perdía en silencio.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { getTool, resolveTools } from './toolRegistry';
import { openModelStream, type AdapterMessage } from './openaiAdapter';
import { actionFieldsFor } from './catalogTools';
import type { ActionFieldDef } from '@/lib/ai/assistant/actionCatalog';
import { resolveModel, type OrgModelSettings } from './modelRouter';
import type { ToolContext, ToolDefinition, ToolPreview } from './types';

/** Eventos que el bucle emite hacia el transporte (SSE hoy, WebSocket en F5). */
export type AgentEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_end'; name: string; summary: string; ok: boolean }
  | {
      type: 'action';
      actionId: string;
      toolName: string;
      risk: string;
      preview: ToolPreview;
      /** Campos editables de la tarjeta; vacío si la herramienta no es de catálogo. */
      fields: ActionFieldDef[];
      expiresAt: string;
    }
  | { type: 'usage'; model: string; promptTokens: number; completionTokens: number; credits: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; content: string };

export type AgentEmit = (event: AgentEvent) => void | Promise<void>;

export interface RunAgentInput {
  systemPrompt: string;
  /** Historial ya saneado: sin roles `system` que vengan del cliente. */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  ctx: ToolContext;
  settings: OrgModelSettings;
  emit: AgentEmit;
  /** Tope de vueltas modelo→herramientas→modelo. */
  maxIterations?: number;
}

export interface RunAgentOutput {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Si el turno quedó pausado esperando confirmación. */
  pendingActionId: string | null;
  toolCalls: Array<{ name: string; ok: boolean }>;
}

/**
 * Etiqueta legible del paso, para el indicador de la interfaz.
 *
 * `tool_start`/`tool_end` no son adorno: son lo que convierte 12 segundos de
 * espera en 12 segundos de trabajo visible, y son la principal palanca de
 * confianza cuando la IA va a tocar el catálogo (§5.7).
 */
function stepLabel(toolName: string): string {
  const labels: Record<string, string> = {
    buscar_productos: 'Buscando en el catálogo…',
    consultar_stock: 'Consultando existencias…',
  };
  return labels[toolName] ?? 'Preparando la acción…';
}

const MAX_ITERATIONS = 4;

export async function runAgent(input: RunAgentInput): Promise<RunAgentOutput> {
  const { ctx, emit, settings } = input;
  const resolved = resolveModel('reasoning', settings);
  const tools = resolveTools(ctx.capabilities, ctx.channel);
  const adapterTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const messages: AdapterMessage[] = [
    { role: 'system', content: input.systemPrompt },
    ...input.history.map((h) => ({ role: h.role, content: h.content } as AdapterMessage)),
    { role: 'user', content: input.message },
  ];

  const maxIterations = input.maxIterations ?? MAX_ITERATIONS;

  let promptTokens = 0;
  let completionTokens = 0;
  let finalContent = '';
  // El modelo que responde puede no ser el configurado: si falla al abrir el
  // stream, el adaptador cae al de emergencia. Se reporta el que respondio.
  let answeringModel = resolved.model;
  const toolCalls: Array<{ name: string; ok: boolean }> = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // El adaptador elige el endpoint segun el modelo: los `gpt-5.x` van por la
    // Responses API y rechazan `max_tokens`; los legacy van por Chat
    // Completions. Llamar al endpoint equivocado hacia fallar TODA respuesta.
    const stream = await openModelStream({
      model: resolved.model,
      messages,
      tools: adapterTools,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
    });
    answeringModel = stream.model;

    let content = '';
    const requested: Array<{ id: string; name: string; args: string }> = [];

    for await (const chunk of stream.chunks) {
      if (chunk.usage) {
        promptTokens += chunk.usage.promptTokens;
        completionTokens += chunk.usage.completionTokens;
      }
      if (chunk.delta) {
        content += chunk.delta;
        await emit({ type: 'token', delta: chunk.delta });
      }
      if (chunk.toolCall && chunk.toolCall.name) {
        requested.push({
          id: chunk.toolCall.id,
          name: chunk.toolCall.name,
          args: chunk.toolCall.arguments,
        });
      }
    }

    finalContent = content || finalContent;

    // Sin llamadas a herramienta: el modelo termino de hablar.
    if (requested.length === 0) {
      messages.push({ role: 'assistant', content });
      break;
    }

    messages.push({
      role: 'assistant',
      content: content || null,
      toolCalls: requested.map((c) => ({ id: c.id, name: c.name, arguments: c.args || '{}' })),
    });

    let paused: string | null = null;

    for (const call of requested) {
      const tool = getTool(call.name) as ToolDefinition<never> | undefined;

      // El modelo pidió algo que no existe o que no se le ofreció. Se le dice,
      // en vez de fallar: sabrá reconducir.
      if (!tool || !tools.some((t) => t.name === call.name)) {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: 'Esa herramienta no está disponible para este usuario.' }),
        });
        continue;
      }

      let args: unknown;
      try {
        args = JSON.parse(call.args || '{}');
      } catch {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: 'Los argumentos no eran JSON válido. Vuelve a intentarlo.' }),
        });
        continue;
      }

      const parsed = tool.parseArgs(args);
      if (parsed === null) {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: 'Faltan argumentos o no son del tipo esperado.' }),
        });
        continue;
      }

      await emit({ type: 'tool_start', name: call.name, label: stepLabel(call.name) });

      // ── Riesgo bajo: se ejecuta y el resultado vuelve al modelo ──────────
      if (tool.risk === 'low') {
        const result = await tool.execute(ctx, parsed);
        toolCalls.push({ name: call.name, ok: result.ok });
        await emit({ type: 'tool_end', name: call.name, summary: result.message, ok: result.ok });
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data }),
        });
        continue;
      }

      // ── Riesgo medio/alto: se propone y se PAUSA ────────────────────────
      const preview = await tool.preview(ctx, parsed);

      const { data: row, error } = await ctx.supabase
        .from('ai_agent_actions')
        .insert({
          organization_id: ctx.organizationId,
          user_id: ctx.userId,
          branch_id: ctx.branchId,
          conversation_id: ctx.conversationId,
          tool_name: tool.name,
          risk: tool.risk,
          args: parsed as Record<string, unknown>,
          preview: preview as unknown as Record<string, unknown>,
          status: 'pending',
        })
        .select('id, expires_at')
        .single();

      if (error || !row) {
        console.error('[GO Assistant] No se pudo persistir la propuesta:', error?.message);
        await emit({ type: 'tool_end', name: call.name, summary: 'No pude preparar la confirmación', ok: false });
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({ ok: false, error: 'No se pudo preparar la confirmación.' }),
        });
        continue;
      }

      const persisted = row as { id: string; expires_at: string };
      toolCalls.push({ name: call.name, ok: true });
      await emit({ type: 'tool_end', name: call.name, summary: preview.summary, ok: true });
      await emit({
        type: 'action',
        actionId: persisted.id,
        toolName: tool.name,
        risk: tool.risk,
        preview,
        fields: actionFieldsFor(tool.name, parsed as Record<string, unknown>) ?? [],
        expiresAt: persisted.expires_at,
      });
      const actionId = persisted.id;
      paused = actionId;
      // Una sola propuesta por turno: si el modelo pide dos escrituras, la
      // segunda espera al siguiente turno. §6.2 prohíbe agrupar acciones
      // medium/high tras un único "sí".
      break;
    }

    if (paused) {
      return {
        content: finalContent,
        model: answeringModel,
        promptTokens,
        completionTokens,
        pendingActionId: paused,
        toolCalls,
      };
    }
  }

  // Cobro por consumo real, una sola vez por turno, cuando la respuesta ya está.
  const totalTokens = promptTokens + completionTokens;
  let credits = 0;
  if (totalTokens > 0) {
    try {
      const charge = await chargeAiCredits({
        orgId: ctx.organizationId,
        actionType: 'assistant_chat',
        model: answeringModel,
        units: totalTokens,
        userId: ctx.userId,
        metadata: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          surface: 'header_assistant',
          model_source: resolved.source,
          tools_offered: tools.length,
        },
      });
      credits = charge.credits;
    } catch (err) {
      console.warn('[GO Assistant] No se pudo cobrar el turno:', err instanceof Error ? err.message : err);
    }
  }

  await emit({
    type: 'usage',
    model: answeringModel,
    promptTokens,
    completionTokens,
    credits,
  });

  return {
    content: finalContent,
    model: answeringModel,
    promptTokens,
    completionTokens,
    pendingActionId: null,
    toolCalls,
  };
}

/** Reexportado para los route handlers, que construyen el `ToolContext`. */
export type { ToolContext, SupabaseClient };
