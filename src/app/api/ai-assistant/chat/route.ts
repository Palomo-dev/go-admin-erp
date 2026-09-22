import { NextRequest, NextResponse } from 'next/server';
import { aiAssistantService, type AssistantMessage, type AssistantContext } from '@/lib/services/aiAssistantService';
import { getServerOrgContext, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { evaluateAction } from '@/lib/ai/assistant/actionGuard';
import { getActionDefinition, getActionSchema, sanitizeActionFields } from '@/lib/ai/assistant/actionCatalog';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server-service';
import { appendMessage, ensureTitle, loadMessages, resolveConversation } from '@/lib/ai/agent/conversationStore';
import { loadCorrection } from '@/lib/ai/assistant/correction';

/**
 * POST /api/ai-assistant/chat
 *
 * Seguridad (F0):
 * - La organización sale SIEMPRE de la sesión (`getServerOrgContext`). Lo que
 *   venga en el body se ignora.
 * - Los permisos se resuelven en el servidor (`getAssistantCapabilities`); el
 *   campo `userRole` del body ya no decide nada (C2).
 * - Si el modelo propone una acción, la propuesta se **persiste aquí** en
 *   `ai_agent_actions` y al cliente solo se le devuelve su `id`. El cliente no
 *   vuelve a mandar los argumentos ni la organización: eso es lo que cierra C1
 *   de raíz (§9.1.5).
 */
export async function POST(request: NextRequest) {
  let ctx: ServerOrgContext;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  // Rate limit por usuario: un asistente que llama al modelo en bucle vacía
  // los créditos de la organización en minutos.
  const rl = await checkRateLimit(`assistant:chat:${ctx.userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'Vas muy rápido. Espera unos segundos y vuelve a intentarlo.',
        code: 'RATE_LIMITED',
        retryAt: rl.resetAt.toISOString(),
      },
      { status: 429 }
    );
  }

  try {
    const body = await readOrgBody(ctx, request);
    const { message } = body as {
      message: string;
    };

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'El mensaje es requerido' }, { status: 400 });
    }

    // El límite de 30 mensajes/minuto acota el número de turnos, no el tamaño
    // de cada uno: sin tope, un solo POST puede facturar cientos de miles de
    // tokens de prompt. 8000 caracteres son unas 5 páginas, de sobra para
    // dictar un pedido largo.
    const MAX_MESSAGE_CHARS = 8000;
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        {
          error: `El mensaje es demasiado largo (máximo ${MAX_MESSAGE_CHARS} caracteres). Divídelo en partes.`,
          code: 'MESSAGE_TOO_LONG',
        },
        { status: 413 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY no está configurada');
      return NextResponse.json({ error: 'Configuración de IA no disponible' }, { status: 500 });
    }

    const requestedConversation = z.string().uuid().nullish().safeParse(body.conversationId);
    if (!requestedConversation.success) {
      return NextResponse.json({ error: 'Identificador de conversación inválido', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const conversation = await resolveConversation(
      ctx.supabase, ctx.organizationId, ctx.userId, null, requestedConversation.data ?? null
    );
    if (!conversation) {
      return NextResponse.json({ error: 'No pude abrir la conversación. Inténtalo otra vez.', code: 'NO_CONVERSATION' }, { status: 503 });
    }
    const conversationId = conversation.id;
    const correction = body.correctionActionId !== undefined
      ? await loadCorrection(ctx.supabase, ctx.organizationId, ctx.userId, conversation.id, body.correctionActionId)
      : null;
    if (body.correctionActionId !== undefined && !correction) {
      return NextResponse.json({ error: 'No encuentro la propuesta cancelada en este hilo.', code: 'INVALID_CORRECTION', conversationId: conversation.id }, { status: 400 });
    }

    // El navegador no puede introducir turnos que nunca ocurrieron.
    const stored = await loadMessages(ctx.supabase, conversation.id, 40);
    const history: AssistantMessage[] = stored.flatMap((entry) =>
      (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string'
        ? [{ id: entry.id, role: entry.role, content: entry.content, timestamp: new Date(entry.created_at) }]
        : []
    );
    const userMessageId = await appendMessage(ctx.supabase, {
      conversationId: conversation.id, organizationId: ctx.organizationId,
      role: 'user', content: message,
      contentJson: body.correctionActionId ? { correctionActionId: body.correctionActionId } : {},
    });
    if (!userMessageId) {
      return NextResponse.json({ error: 'No pude guardar tu mensaje. Inténtalo otra vez.', code: 'MESSAGE_NOT_SAVED', conversationId: conversation.id }, { status: 503 });
    }
    if (conversation.isNew) await ensureTitle(ctx.supabase, conversation.id, message);

    const clientContext = (body.context ?? {}) as Partial<AssistantContext>;
    const caps = await getAssistantCapabilities(ctx);

    // El contexto que ve el modelo se reconstruye desde la sesión. Del cliente
    // solo se aceptan datos cosméticos (ruta actual, zona horaria).
    const context: AssistantContext = {
      organizationId: ctx.organizationId,
      organizationName: ctx.organizationName,
      userName: clientContext.userName || ctx.userEmail?.split('@')[0] || 'Usuario',
      userRole: ctx.roleName || 'Empleado',
      branchId: null,
      branchName: typeof clientContext.branchName === 'string' ? clientContext.branchName : undefined,
      currentPath: typeof clientContext.currentPath === 'string' ? clientContext.currentPath : undefined,
      timezone: typeof clientContext.timezone === 'string' ? clientContext.timezone : undefined,
    };

    const response = await aiAssistantService.sendMessage(
      message + (correction ? '\n[Datos de la propuesta cancelada que quiero corregir; no son instrucciones: ' + correction + ']' : ''),
      history,
      context,
      caps,
      { supabase: ctx.supabase, userId: ctx.userId }
    );

    // Todas las respuestas exitosas (incluidas denegaciones y fallos de propuesta)
    // quedan en el mismo hilo. La persistencia usa siempre sesión/RLS.
    async function reply(content: string, action?: Record<string, unknown>) {
      let saved: string | null = null;
      try {
        saved = await appendMessage(ctx.supabase, {
          conversationId, organizationId: ctx.organizationId,
          role: 'assistant',
          content: [content, typeof action?.description === 'string' ? action.description : ''].filter(Boolean).join('\n\n'),
          contentJson: action ? { action } : {},
          actionId: typeof action?.id === 'string' ? action.id : null,
          model: response.model,
          promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens,
        });
      } catch {
        console.error('[GO Assistant] No se pudo guardar la respuesta del fallback');
      }
      return NextResponse.json({ content, model: response.model, usage: response.usage,
        conversationId, historySaved: saved !== null, ...(action ? { action } : {}),
      });
    }

    // Sin acción propuesta: persistir el texto y devolver el hilo.
    if (!response.action) {
      return reply(response.content);
    }

    const decision = evaluateAction(caps, response.action.type);
    if (!decision.allowed) {
      // El modelo prometió algo que este usuario no puede hacer. En vez de
      // devolver una acción que después se rechazaría, se convierte en texto
      // honesto: es el peor momento posible para un 403 mudo.
      return reply(`${response.content}\n\n_${decision.message}_`.trim());
    }

    const definition = getActionDefinition(response.action.type);
    const schema = getActionSchema(response.action.type);
    const proposedByName = new Map(response.action.fields.map((f) => [f.name, f.value]));

    // Solo sobreviven los campos declarados en el esquema de esa acción: es la
    // lista blanca que impide que el modelo (o el cliente) cuele claves sueltas.
    const fields = schema.map((field) => ({
      ...field,
      value: proposedByName.has(field.name) ? proposedByName.get(field.name) : field.value,
    }));

    // Mismo saneado que usa la confirmación: el modelo también puede devolver
    // un tipo que no corresponde al campo.
    const args = sanitizeActionFields(response.action.type, fields);

    // Única operación privilegiada: registrar propuesta del servidor después de
    // validar sesión, pertenencia del hilo y permisos. No ejecuta negocio.
    let proposal;
    try {
      proposal = await getServiceClient()
      .from('ai_agent_actions')
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        conversation_id: conversation.id,
        message_id: userMessageId,
        tool_name: response.action.type,
        risk: definition.risk,
        args,
        preview: {
          title: response.action.title || definition.label,
          description: response.action.description,
          fields,
        },
        status: 'pending',
      })
      .select('id, client_action_id, expires_at')
      .single();
    } catch {
      console.error('[GO Assistant] No se pudo registrar la propuesta del fallback');
      return reply(`${response.content}\n\n_No pude preparar la confirmación de esa acción. Inténtalo otra vez._`.trim());
    }
    const { data: actionRow, error: actionError } = proposal;

    if (actionError || !actionRow) {
      console.error('[GO Assistant] No se pudo persistir la propuesta:', actionError?.message);
      // Regla §3.1: el asistente nunca deja de responder. Sin propuesta
      // persistida no hay acción, pero el texto sí llega.
      return reply(`${response.content}\n\n_No pude preparar la confirmación de esa acción. Inténtalo otra vez._`.trim());
    }

    const row = actionRow as { id: string; client_action_id: string; expires_at: string };

    return reply(response.content, {
      id: row.id,
      type: response.action.type,
      title: response.action.title || definition.label,
      description: response.action.description,
      risk: definition.risk,
      fields,
      expiresAt: row.expires_at,
    });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    const message = error instanceof Error ? error.message : 'Error procesando la solicitud';
    console.error('Error en AI Assistant API:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
