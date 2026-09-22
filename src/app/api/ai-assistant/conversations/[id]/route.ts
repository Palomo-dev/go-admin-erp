import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { loadMessages } from '@/lib/ai/agent/conversationStore';
import { actionFieldsFor } from '@/lib/ai/agent/catalogTools';

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
    await readOrgBody(ctx, request);
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
  const { data: actions, error: actionsError } = await ctx.supabase.from('ai_agent_actions')
    .select('id, tool_name, risk, args, preview, status, result, error_message, created_at, executed_at, undone_at, expires_at')
    .eq('conversation_id', id).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId)
    .order('created_at', { ascending: false }).limit(MAX_MENSAJES);
  if (actionsError) {
    return NextResponse.json({ error: 'No pude recuperar el estado de las acciones. Inténtalo otra vez.', code: 'ACTIONS_UNAVAILABLE' }, { status: 503 });
  }
  type HistoryAction = { id: string; tool_name: string; risk: string; args: Record<string, unknown>;
    preview: { title?: string; summary?: string; description?: string; lines?: unknown[]; warnings?: string[]; reversible?: boolean };
    status: string; result: { success?: boolean; message?: string } | null; error_message: string | null;
    expires_at: string; created_at: string; executed_at: string | null; undone_at: string | null };
  const rows = (actions ?? []) as HistoryAction[];
  const pendingActions = rows.filter(a => conversacion.status === 'active' && ['pending', 'confirmed'].includes(a.status)
    && ['medium', 'high'].includes(a.risk) && Date.parse(a.expires_at) > Date.now()).reverse().map(a => ({
      id: a.id, type: a.tool_name, title: a.preview?.title ?? a.tool_name,
      description: a.preview?.summary ?? a.preview?.description ?? '', risk: a.risk,
      fields: actionFieldsFor(a.tool_name, a.args) ?? [], expiresAt: a.expires_at,
      preview: { ...a.preview, lines: a.preview?.lines ?? [], warnings: a.preview?.warnings ?? [], reversible: a.preview?.reversible !== false },
    }));
  // Registros anteriores a la persistencia de resultados también son retomables.
  // No duplicar un resultado ya guardado; una anulación posterior sí es otro estado.
  for (const action of rows) {
    if (!['executed', 'failed', 'undone', 'executing'].includes(action.status)) continue;
    if (action.status !== 'undone' && messages.some(m => m.action_id === action.id && m.content_json?.kind === 'action_result')) continue;
    const content = action.status === 'undone' ? 'Acción deshecha.'
      : action.status === 'executing' ? 'Acción en ejecución o pendiente de conciliación. No la repitas.'
      : `${action.status === 'executed' ? 'Acción completada' : 'La acción no se completó'}: ${action.result?.message ?? action.error_message ?? action.tool_name}`;
    messages.push({ id: `action-state-${action.id}-${action.status}`, role: 'assistant', action_id: action.id,
      content, content_json: { kind: 'action_result', status: action.status },
      created_at: action.undone_at ?? action.executed_at ?? action.created_at });
  }
  messages.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

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
    pendingActions,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
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
