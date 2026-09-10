/**
 * Persistencia de email_messages + activity única (C15) + helpers de estado.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError, type EmailMessage, type EmailMessageMeta, type EmailMessageStatus } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export function buildIdempotencyKey(emailMessageId: string): string {
  return `email/${emailMessageId}`;
}

export function messageId(): string {
  return randomUUID();
}

export async function insertMessage(row: Record<string, unknown>, supabase: SupabaseClient): Promise<EmailMessage> {
  const { data, error } = await supabase.from('email_messages').insert(row).select('*').single();
  if (error || !data) throw new EmailError('DB', `email_messages insert: ${error?.message ?? 'sin datos'}`, 500);
  return data as EmailMessage;
}

export async function updateMessage(id: string, patch: Record<string, unknown>, supabase: SupabaseClient): Promise<EmailMessage | null> {
  const { data, error } = await supabase.from('email_messages').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').maybeSingle();
  if (error) {
    console.warn('[email] update email_messages falló:', error.message);
    return null;
  }
  return (data as EmailMessage | null) ?? null;
}

export async function mergeMeta(msg: EmailMessage, patch: Partial<EmailMessageMeta>, extra: Record<string, unknown>, supabase: SupabaseClient): Promise<EmailMessage> {
  const updated = await updateMessage(msg.id, { ...extra, metadata: { ...(msg.metadata ?? {}), ...patch } }, supabase);
  return updated ?? { ...msg, ...extra, metadata: { ...(msg.metadata ?? {}), ...patch } } as EmailMessage;
}

export async function markFailed(msg: EmailMessage, error: string, supabase: SupabaseClient): Promise<EmailMessage> {
  return mergeMeta(msg, { last_error: error.slice(0, 500), failed_at: new Date().toISOString() }, { status: 'failed' satisfies EmailMessageStatus }, supabase);
}

export async function findByClientRequestId(orgId: number, clientRequestId: string, supabase: SupabaseClient): Promise<EmailMessage | null> {
  const { data } = await supabase
    .from('email_messages')
    .select('*')
    .eq('organization_id', orgId)
    .contains('metadata', { client_request_id: clientRequestId })
    .limit(1)
    .maybeSingle();
  return (data as EmailMessage | null) ?? null;
}

export async function getMessage(orgId: number, id: string, supabase: SupabaseClient): Promise<EmailMessage | null> {
  const { data, error } = await supabase.from('email_messages').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (error) throw new EmailError('DB', error.message, 500);
  return (data as EmailMessage | null) ?? null;
}

export async function requireMessage(orgId: number, id: string, supabase: SupabaseClient): Promise<EmailMessage> {
  const m = await getMessage(orgId, id, supabase);
  if (!m) throw new EmailError('NOT_FOUND', 'Correo no encontrado', 404);
  return m;
}

/**
 * UNA sola activity por correo (activity_type 'email', email_message_id,
 * channel 'email'). Idempotente por email_message_id.
 */
export async function upsertEmailActivity(
  msg: EmailMessage,
  opts: { userId: string | null; direction: 'outbound' | 'inbound'; notes?: string },
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: existing } = await supabase.from('activities').select('id').eq('email_message_id', msg.id).limit(1).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const related = msg.related_type && isUuid(msg.related_id) ? { related_type: msg.related_type, related_id: msg.related_id } : {};
  const row = {
    organization_id: msg.organization_id,
    activity_type: 'email',
    channel: 'email',
    user_id: opts.userId,
    notes: opts.notes ?? (opts.direction === 'inbound' ? `Respuesta de ${msg.from_email}: "${msg.subject}"` : `Email a ${msg.to_email}: "${msg.subject}"`),
    occurred_at: new Date().toISOString(),
    email_message_id: msg.id,
    ...related,
    metadata: { subject: msg.subject, to: msg.to_email, from: msg.from_email, status: msg.status, direction: opts.direction, email_message_id: msg.id, test: msg.metadata?.test ? true : undefined },
  };
  const { data, error } = await supabase.from('activities').insert(row).select('id').single();
  if (error) {
    console.warn('[email] No se pudo crear la activity:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

export async function syncActivityStatus(emailMessageId: string, status: string, supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.from('activities').select('id, metadata').eq('email_message_id', emailMessageId).limit(1).maybeSingle();
  if (!data) return;
  const r = data as { id: string; metadata: Record<string, unknown> | null };
  await supabase.from('activities').update({ metadata: { ...(r.metadata ?? {}), status } }).eq('id', r.id);
}
