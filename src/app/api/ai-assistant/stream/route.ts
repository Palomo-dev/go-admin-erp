import { NextRequest } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { runAgent, type AgentEvent } from '@/lib/ai/agent/runAgent';
import { resolveTools } from '@/lib/ai/agent/toolRegistry';
import { buildSystemPrompt } from '@/lib/ai/agent/systemPrompt';
import { loadOrgModelSettings } from '@/lib/ai/agent/modelRouter';
import {
  appendMessage,
  ensureTitle,
  loadMessages,
  resolveConversation,
} from '@/lib/ai/agent/conversationStore';
import { resolveOrgCurrency } from '@/lib/ai/assistant/orgCurrency';
import type { ToolContext } from '@/lib/ai/agent/types';

/**
 * POST /api/ai-assistant/stream  →  Server-Sent Events
 *
 * Sustituye al `NextResponse.json(...)` de `/chat`, que devolvía todo de golpe
 * cuando el modelo terminaba: entre 5 y 20 segundos de tres puntitos rebotando
 * (C7). Con herramientas de por medio —buscar en el catálogo, preparar una
 * tarjeta— esperar en silencio deja de ser viable.
 *
 * Eventos (§5.7):
 *   token       {delta}
 *   tool_start  {name, label}     "Buscando en el catálogo…"
 *   tool_end    {name, summary}   "6 coincidencias"
 *   action      {actionId, preview}
 *   usage       {model, credits}
 *   error       {message, code}
 *   done        {content, conversationId}
 *
 * `/chat` se mantiene intacto y funcionando: es el camino de respaldo del §3.1
 * ("si el motor nuevo falla, cae al camino de hoy antes que devolver error").
 */

const MAX_MESSAGE_CHARS = 8000;

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx y algunos proxies bufferizan SSE y anulan todo el propósito.
    'X-Accel-Buffering': 'no',
  };
}

function encodeEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Respuesta de error como SSE, para que el cliente no tenga dos caminos. */
function errorStream(message: string, code: string, status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encodeEvent('error', { message, code }));
      controller.enqueue(encodeEvent('done', { content: '' }));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: sseHeaders() });
}

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return new Response(JSON.stringify({ error: err.message, code: err.code }), {
        status: err.statusCode,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }

  const rl = await checkRateLimit(`assistant:stream:${ctx.userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return errorStream('Vas muy rápido. Espera unos segundos y vuelve a intentarlo.', 'RATE_LIMITED');
  }

  let body: { message?: unknown; conversationId?: unknown; context?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return errorStream('Petición mal formada.', 'BAD_REQUEST');
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return errorStream('El mensaje es requerido.', 'BAD_REQUEST');
  if (message.length > MAX_MESSAGE_CHARS) {
    return errorStream(
      `El mensaje es demasiado largo (máximo ${MAX_MESSAGE_CHARS} caracteres). Divídelo en partes.`,
      'MESSAGE_TOO_LONG'
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY no está configurada');
    return errorStream('La IA no está configurada en este entorno.', 'NOT_CONFIGURED');
  }

  // Saldo ANTES de llamar al modelo; el cobro va después, dentro de runAgent.
  const balance = await checkAICredits(ctx.organizationId);
  if (!balance.allowed) {
    return errorStream(balance.error || 'Créditos de IA insuficientes.', 'NO_CREDITS');
  }

  const caps = await getAssistantCapabilities(ctx);
  const conversation = await resolveConversation(
    ctx.supabase,
    ctx.organizationId,
    ctx.userId,
    null,
    typeof body.conversationId === 'string' ? body.conversationId : null
  );

  if (!conversation) {
    return errorStream('No pude abrir la conversación. Inténtalo otra vez.', 'NO_CONVERSATION');
  }

  const clientContext = body.context ?? {};
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        const { type, ...rest } = event;
        controller.enqueue(encodeEvent(type, rest));
      };

      try {
        // El historial sale de la BASE, no del cliente: ya no se puede inyectar
        // un turno que nunca ocurrió.
        const stored = await loadMessages(ctx.supabase, conversation.id, 40);
        const history = stored
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))
          .slice(-20);

        await appendMessage(ctx.supabase, {
          conversationId: conversation.id,
          organizationId: ctx.organizationId,
          role: 'user',
          content: message,
        });
        if (conversation.isNew) await ensureTitle(ctx.supabase, conversation.id, message);

        const settings = await loadOrgModelSettings(ctx.supabase, ctx.organizationId);
        // La moneda sale de `organization_currencies.is_base`. Estaba cableada
        // a 'COP': para una organización que factura en dólares eso guardaba
        // importes en USD etiquetados como pesos.
        const currency = await resolveOrgCurrency(ctx.supabase, ctx.organizationId);
        const toolCtx: ToolContext = {
          organizationId: ctx.organizationId,
          branchId: null,
          userId: ctx.userId,
          supabase: ctx.supabase,
          capabilities: caps,
          locale: settings.language || 'es-CO',
          currency: currency.code,
          channel: 'text',
          conversationId: conversation.id,
        };

        const tools = resolveTools(caps, 'text');
        const systemPrompt = buildSystemPrompt(
          {
            organizationName: ctx.organizationName,
            userName: typeof clientContext.userName === 'string' ? clientContext.userName : 'Usuario',
            roleName: ctx.roleName,
            branchName: typeof clientContext.branchName === 'string' ? clientContext.branchName : null,
            currentPath: typeof clientContext.currentPath === 'string' ? clientContext.currentPath : null,
            timezone: typeof clientContext.timezone === 'string' ? clientContext.timezone : null,
            currency: currency.code,
          },
          caps,
          tools,
          settings
        );

        const result = await runAgent({
          systemPrompt,
          history,
          message,
          ctx: toolCtx,
          settings,
          emit: send,
        });

        await appendMessage(ctx.supabase, {
          conversationId: conversation.id,
          organizationId: ctx.organizationId,
          role: 'assistant',
          content: result.content,
          contentJson: { toolCalls: result.toolCalls },
          actionId: result.pendingActionId,
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          latencyMs: Date.now() - startedAt,
        });

        send({ type: 'done', content: result.content });
        controller.enqueue(encodeEvent('meta', { conversationId: conversation.id }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Error inesperado';
        console.error('[GO Assistant] Fallo en el stream:', detail);
        // §3.1: el asistente nunca deja de responder. El cliente recibe un
        // error legible por el mismo canal y puede reintentar por `/chat`.
        send({ type: 'error', message: 'No pude completar la respuesta. Inténtalo otra vez.', code: 'AGENT_ERROR' });
        send({ type: 'done', content: '' });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
