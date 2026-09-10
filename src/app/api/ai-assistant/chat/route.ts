import { NextRequest, NextResponse } from 'next/server';
import { aiAssistantService, type AssistantMessage, type AssistantContext } from '@/lib/services/aiAssistantService';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { evaluateAction } from '@/lib/ai/assistant/actionGuard';
import { getActionDefinition, getActionSchema, sanitizeActionFields } from '@/lib/ai/assistant/actionCatalog';
import { checkRateLimit } from '@/lib/security/rateLimit';

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
  let ctx;
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
    const body = await request.json();
    const { message, conversationHistory } = body as {
      message: string;
      conversationHistory?: AssistantMessage[];
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
      message,
      Array.isArray(conversationHistory) ? conversationHistory : [],
      context,
      caps,
      { supabase: ctx.supabase, userId: ctx.userId }
    );

    // Sin acción propuesta: se devuelve el texto y ya.
    if (!response.action) {
      return NextResponse.json({ content: response.content, model: response.model, usage: response.usage });
    }

    const decision = evaluateAction(caps, response.action.type);
    if (!decision.allowed) {
      // El modelo prometió algo que este usuario no puede hacer. En vez de
      // devolver una acción que después se rechazaría, se convierte en texto
      // honesto: es el peor momento posible para un 403 mudo.
      return NextResponse.json({
        content: `${response.content}\n\n_${decision.message}_`.trim(),
        model: response.model,
        usage: response.usage,
      });
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

    const { data: actionRow, error: actionError } = await ctx.supabase
      .from('ai_agent_actions')
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
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

    if (actionError || !actionRow) {
      console.error('[GO Assistant] No se pudo persistir la propuesta:', actionError?.message);
      // Regla §3.1: el asistente nunca deja de responder. Sin propuesta
      // persistida no hay acción, pero el texto sí llega.
      return NextResponse.json({
        content: `${response.content}\n\n_No pude preparar la confirmación de esa acción. Inténtalo otra vez._`.trim(),
        model: response.model,
        usage: response.usage,
      });
    }

    const row = actionRow as { id: string; client_action_id: string; expires_at: string };

    return NextResponse.json({
      content: response.content,
      model: response.model,
      usage: response.usage,
      action: {
        id: row.id,
        type: response.action.type,
        title: response.action.title || definition.label,
        description: response.action.description,
        risk: definition.risk,
        fields,
        expiresAt: row.expires_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error procesando la solicitud';
    console.error('Error en AI Assistant API:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
