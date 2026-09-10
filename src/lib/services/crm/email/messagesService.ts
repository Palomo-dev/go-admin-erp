/**
 * Lectura de email_messages / email_events (lista con filtros, detalle con
 * eventos e hilo). Usa el cliente de sesión (RLS) + filtro por org.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError, type EmailEvent, type EmailMessage, type EmailMessageStatus } from './types';
import { getMessage } from './messageStore';

export interface EmailMessageFilters {
  status?: EmailMessageStatus;
  to_customer_id?: string;
  related_type?: string;
  related_id?: string;
  template_id?: string;
  direction?: 'inbound' | 'outbound';
  thread_id?: string;
  limit?: number;
  offset?: number;
}

export async function listMessages(orgId: number, filters: EmailMessageFilters, supabase: SupabaseClient): Promise<{ data: EmailMessage[]; count: number }> {
  let q = supabase.from('email_messages').select('*', { count: 'exact' }).eq('organization_id', orgId).order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.to_customer_id) q = q.eq('to_customer_id', filters.to_customer_id);
  if (filters.related_type) q = q.eq('related_type', filters.related_type);
  if (filters.related_id) q = q.eq('related_id', filters.related_id);
  if (filters.template_id) q = q.eq('template_id', filters.template_id);
  if (filters.direction) q = q.contains('metadata', { direction: filters.direction });
  if (filters.thread_id) q = q.contains('metadata', { thread_id: filters.thread_id });
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw new EmailError('DB', error.message, 500);
  return { data: (data ?? []) as EmailMessage[], count: count ?? 0 };
}

export async function listEvents(orgId: number, messageId: string, supabase: SupabaseClient): Promise<EmailEvent[]> {
  const { data, error } = await supabase.from('email_events').select('*').eq('email_message_id', messageId).eq('organization_id', orgId).order('occurred_at', { ascending: true });
  if (error) throw new EmailError('DB', error.message, 500);
  return (data ?? []) as EmailEvent[];
}

export interface MessageDetail {
  message: EmailMessage;
  events: EmailEvent[];
  thread: EmailMessage[];
}

export async function getMessageDetail(orgId: number, id: string, supabase: SupabaseClient): Promise<MessageDetail | null> {
  const message = await getMessage(orgId, id, supabase);
  if (!message) return null;
  const threadId = message.metadata?.thread_id ?? message.id;
  const [events, thread] = await Promise.all([
    listEvents(orgId, id, supabase),
    supabase.from('email_messages').select('*').eq('organization_id', orgId).contains('metadata', { thread_id: threadId }).order('created_at', { ascending: true }),
  ]);
  return { message, events, thread: ((thread.data ?? []) as EmailMessage[]).filter((m) => m.id !== id) };
}

/** Agregado simple por plantilla (para stats de la UI). */
export async function templateStats(orgId: number, templateId: string, supabase: SupabaseClient): Promise<{ sent: number; opened: number; clicked: number; bounced: number }> {
  const { data } = await supabase.from('email_messages').select('status, open_count, click_count').eq('organization_id', orgId).eq('template_id', templateId).limit(5000);
  const rows = (data ?? []) as { status: string; open_count: number; click_count: number }[];
  return {
    sent: rows.filter((r) => !['pending', 'failed'].includes(r.status)).length,
    opened: rows.filter((r) => r.open_count > 0).length,
    clicked: rows.filter((r) => r.click_count > 0).length,
    bounced: rows.filter((r) => r.status === 'bounced').length,
  };
}
