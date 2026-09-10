/**
 * GO Assistant — persistencia de la conversación (C6).
 *
 * Antes el hilo vivía en `useState`: se cerraba el panel y se perdía todo. Sin
 * historial no hay forma de retomar "lo que estábamos subiendo ayer", ni de
 * saber qué pidió el usuario antes de una acción, ni de medir si el asistente
 * mejora.
 *
 * Todo pasa por el cliente de sesión: la RLS restringe cada hilo a su autor (y
 * a los administradores de la organización, para auditar).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConversationRow {
  id: string;
  title: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  content_json: Record<string, unknown>;
  action_id: string | null;
  created_at: string;
}

/**
 * Devuelve el hilo pedido si es del usuario, o crea uno nuevo.
 *
 * No se confía en el `conversationId` del cliente: se comprueba pertenencia
 * explícitamente además de la RLS.
 */
export async function resolveConversation(
  supabase: SupabaseClient,
  organizationId: number,
  userId: string,
  branchId: number | null,
  conversationId?: string | null
): Promise<{ id: string; isNew: boolean } | null> {
  if (conversationId) {
    const { data } = await supabase
      .from('ai_assistant_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (data) return { id: (data as { id: string }).id, isNew: false };
    // Un id que no es suyo o que ya no existe no es un error para el usuario:
    // se le abre uno nuevo y sigue hablando.
  }

  const { data, error } = await supabase
    .from('ai_assistant_conversations')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      branch_id: branchId,
      channel: 'text',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[GO Assistant] No se pudo abrir la conversación:', error?.message);
    return null;
  }
  return { id: (data as { id: string }).id, isNew: true };
}

export async function appendMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    organizationId: number;
    role: StoredMessage['role'];
    content: string | null;
    contentJson?: Record<string, unknown>;
    actionId?: string | null;
    model?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    credits?: number | null;
    latencyMs?: number | null;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_assistant_messages')
    .insert({
      conversation_id: input.conversationId,
      organization_id: input.organizationId,
      role: input.role,
      content: input.content,
      content_json: input.contentJson ?? {},
      action_id: input.actionId ?? null,
      model: input.model ?? null,
      prompt_tokens: input.promptTokens ?? null,
      completion_tokens: input.completionTokens ?? null,
      credits: input.credits ?? null,
      latency_ms: input.latencyMs ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Perder un mensaje del historial no puede tumbar la respuesta que el
    // usuario está leyendo. Se registra y se sigue.
    console.error('[GO Assistant] No se pudo guardar el mensaje:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Historial para reconstruir el hilo al reabrir el panel. */
export async function loadMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 100
): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from('ai_assistant_messages')
    .select('id, role, content, content_json, action_id, created_at')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[GO Assistant] No se pudo leer el historial:', error.message);
    return [];
  }
  return (data ?? []) as StoredMessage[];
}

/** Hilos recientes del usuario, para el panel de historial. */
export async function listConversations(
  supabase: SupabaseClient,
  organizationId: number,
  userId: string,
  limit = 30
): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from('ai_assistant_conversations')
    .select('id, title, message_count, last_message_at, created_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('[GO Assistant] No se pudo listar el historial:', error.message);
    return [];
  }
  return (data ?? []) as ConversationRow[];
}

/**
 * Título del hilo a partir del primer mensaje.
 *
 * Deliberadamente SIN llamar al modelo: el plan lo sugiere con el modelo barato,
 * pero eso son créditos del cliente por algo que un recorte resuelve. Si más
 * adelante los títulos resultan malos, se cambia — pero no se paga por
 * adelantado.
 */
export async function ensureTitle(
  supabase: SupabaseClient,
  conversationId: string,
  firstMessage: string
): Promise<void> {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  const title = clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
  if (!title) return;

  const { error } = await supabase
    .from('ai_assistant_conversations')
    .update({ title })
    .eq('id', conversationId)
    .is('title', null);

  if (error) console.warn('[GO Assistant] No se pudo poner título al hilo:', error.message);
}
