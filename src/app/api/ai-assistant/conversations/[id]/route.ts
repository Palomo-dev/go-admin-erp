import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { loadMessages } from '@/lib/ai/agent/conversationStore';

/**
 * GET    /api/ai-assistant/conversations/[id]  → mensajes del hilo
 * DELETE /api/ai-assistant/conversations/[id]  → archiva el hilo
 *
 * "Borrar" archiva (`status = 'archived'`) y no destruye nada: el hilo es la
 * traza de por qué se propuso cada acción, y `ai_agent_actions` apunta a él
 * desde `ai_assistant_messages.action_id`. Un `DELETE` real dejaría la auditoría
 * del §9.5 sin la mitad de la historia.
 *
 * Seguridad (§9.1): organización y usuario salen de la sesión. La pertenencia
 * del hilo se comprueba **explícitamente** además de la RLS, igual que hace
 * `resolveConversation`: la política de SELECT deja a los administradores ver
 * los hilos de su organización para auditar, y este endpoint no es esa puerta.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MENSAJES = 200;

interface FilaConversacion {
  id: string;
  title: string | null;
  status: string;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

/** Devuelve el hilo si es de este usuario en esta organización. */
async function propio(
  ctx: Awaited<ReturnType<typeof getServerOrgContext>>,
  id: string
): Promise<FilaConversacion | null> {
  const { data } = await ctx.supabase
    .from('ai_assistant_conversations')
    .select('id, title, status, message_count, last_message_at, created_at')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  return (data as FilaConversacion | null) ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  const rl = await checkRateLimit(`assistant:conversation-read:${ctx.userId}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Identificador de conversación inválido.', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const conversacion = await propio(ctx, id);
  if (!conversacion) {
    // 404 y no 403: no se le confirma a nadie que un hilo ajeno existe.
    return NextResponse.json({ error: 'Esa conversación no existe.', code: 'NOT_FOUND' }, { status: 404 });
  }

  const messages = await loadMessages(ctx.supabase, id, MAX_MENSAJES);

  return NextResponse.json({
    conversation: {
      id: conversacion.id,
      title: conversacion.title,
      status: conversacion.status,
      message_count: conversacion.message_count,
      last_message_at: conversacion.last_message_at,
      created_at: conversacion.created_at,
    },
    messages,
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  const rl = await checkRateLimit(`assistant:conversation-archive:${ctx.userId}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Identificador de conversación inválido.', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const conversacion = await propio(ctx, id);
  if (!conversacion) {
    return NextResponse.json({ error: 'Esa conversación no existe.', code: 'NOT_FOUND' }, { status: 404 });
  }
  if (conversacion.status === 'archived') {
    return NextResponse.json({ ok: true, archived: true });
  }

  const { error } = await ctx.supabase
    .from('ai_assistant_conversations')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId);

  if (error) {
    console.error('[GO Assistant] No se pudo archivar la conversación:', error.message);
    return NextResponse.json({ error: 'No se pudo archivar la conversación.', code: 'UPDATE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, archived: true });
}
