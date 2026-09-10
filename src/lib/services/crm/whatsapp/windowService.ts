/**
 * Ventana de servicio de 24 h de WhatsApp (FASE-16 §2.2).
 *
 * `fn_whatsapp_window` no existe en BD → se calcula en TS a partir de
 * `conversations.last_inbound_at` (columna de F0, mantenida por el trigger
 * `trg_messages_set_last_inbound`). Se evalúa por (customer, channel): la
 * conversación con el inbound más reciente decide.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WindowState } from './types';

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cálculo puro (testeable). */
export function computeWindow(lastInboundAt: string | Date | null | undefined, now: Date = new Date()): Omit<WindowState, 'conversation_id'> {
  if (!lastInboundAt) return { is_open: false, last_inbound_at: null, expires_at: null };
  const d = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  if (Number.isNaN(d.getTime())) return { is_open: false, last_inbound_at: null, expires_at: null };
  const expires = new Date(d.getTime() + WINDOW_MS);
  return {
    is_open: expires.getTime() > now.getTime(),
    last_inbound_at: d.toISOString(),
    expires_at: expires.toISOString(),
  };
}

export async function getWindow(
  orgId: number,
  customerId: string,
  channelId: string,
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<WindowState> {
  const { data } = await supabase
    .from('conversations')
    .select('id, last_inbound_at, status, last_message_at')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .eq('channel_id', channelId)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; last_inbound_at: string | null } | null;
  const w = computeWindow(row?.last_inbound_at ?? null, now);
  return { ...w, conversation_id: row?.id ?? null };
}

export async function getWindowByConversation(
  orgId: number,
  conversationId: string,
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<WindowState & { customer_id: string | null; channel_id: string | null }> {
  const { data } = await supabase
    .from('conversations')
    .select('id, customer_id, channel_id, last_inbound_at')
    .eq('organization_id', orgId)
    .eq('id', conversationId)
    .maybeSingle();
  const row = data as { id: string; customer_id: string; channel_id: string; last_inbound_at: string | null } | null;
  const w = computeWindow(row?.last_inbound_at ?? null, now);
  return { ...w, conversation_id: row?.id ?? null, customer_id: row?.customer_id ?? null, channel_id: row?.channel_id ?? null };
}

/** Texto humano para la UI ("vence en 5 h 12 min"). */
export function describeWindow(w: Pick<WindowState, 'is_open' | 'expires_at' | 'last_inbound_at'>, now: Date = new Date()): string {
  if (!w.last_inbound_at) return 'Sin mensajes del cliente: solo plantillas';
  if (!w.is_open || !w.expires_at) return 'Ventana cerrada: usa una plantilla aprobada';
  const ms = new Date(w.expires_at).getTime() - now.getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `Ventana abierta · vence en ${h > 0 ? `${h} h ` : ''}${m} min`;
}
