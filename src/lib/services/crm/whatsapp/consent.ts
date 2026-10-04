/**
 * Consentimiento por canal (contact_consents + customers.metadata.do_not_*).
 * FASE-16 §4.2 `consentService` (ampliación; el `consentService.ts` existente
 * solo cubre grabación de llamadas).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getWindowByConversation } from './windowService';
import { DEFAULT_OPTIN_KEYWORDS, DEFAULT_OPTOUT_KEYWORDS } from './types';

export type ContactChannel = 'email' | 'whatsapp' | 'sms' | 'voice';
export type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown';

/** RPC `fn_can_contact(p_org, p_customer, p_channel, p_purpose)` (F0). Fail-closed si la RPC falla. */
export async function canContact(
  orgId: number,
  customerId: string,
  channel: ContactChannel,
  purpose: 'utility' | 'marketing',
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_can_contact', {
    p_org: orgId,
    p_customer: customerId,
    p_channel: channel,
    p_purpose: purpose,
  });
  if (error) {
    console.warn('[whatsapp/consent] fn_can_contact falló:', error.message);
    return false;
  }
  return data === true;
}

export async function setConsent(
  orgId: number,
  customerId: string,
  channel: ContactChannel,
  status: ConsentStatus,
  source: string,
  evidence: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.rpc('crm_set_contact_consent', {
    p_org: orgId, p_customer: customerId, p_channel: channel, p_status: status, p_source: source, p_evidence: evidence,
  });
  if (error) throw error;
}

export interface ContactConsent {
  id: string;
  channel: ContactChannel;
  status: ConsentStatus;
  source: string | null;
  evidence: Record<string, unknown> | null;
  changed_at: string;
}

export async function listConsents(orgId: number, customerId: string, supabase: SupabaseClient): Promise<ContactConsent[]> {
  const { data, error } = await supabase
    .from('contact_consents')
    .select('id, channel, status, source, evidence, changed_at')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactConsent[];
}

/** Misma normalización que el trigger previsto en BD: sin acentos, mayúsculas, sin puntuación. */
export function normalizeKeyword(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isOptOutKeyword(text: string, keywords: string[] = DEFAULT_OPTOUT_KEYWORDS): boolean {
  const norm = normalizeKeyword(text);
  if (!norm) return false;
  return keywords.some((k) => normalizeKeyword(k) === norm);
}

export function isOptInKeyword(text: string, keywords: string[] = DEFAULT_OPTIN_KEYWORDS): boolean {
  const norm = normalizeKeyword(text);
  if (!norm) return false;
  return keywords.some((k) => normalizeKeyword(k) === norm);
}

/** Mensaje persistido y propio: SQL verifica identidad, contenido y configuración del canal. */
export async function applyInboundConsent(
  params: { orgId: number; customerId: string; messageId: string },
  supabase: SupabaseClient,
): Promise<'opted_out' | 'opted_in' | 'none'> {
  const { data, error } = await supabase.rpc('crm_apply_inbound_contact_consent', {
    p_org: params.orgId, p_message: params.messageId,
  });
  if (error) throw error;
  if (!['opted_out', 'opted_in', 'none'].includes(String(data))) throw new Error('Respuesta de consentimiento inválida');
  return data as 'opted_out' | 'opted_in' | 'none';
}

export interface AutoReplyGate {
  allowed: boolean;
  /** Motivo legible para la respuesta de la ruta (nunca se envía al cliente final). */
  reason?: 'opted_out' | 'window_closed';
  message?: string;
}

/**
 * ¿Puede una respuesta AUTOMÁTICA (IA, bot, secuencia) salir por esta
 * conversación?
 *
 * Los dos controles que `whatsappOutboundService.sendWhatsApp` aplica al envío
 * manual y que la ruta de auto-respuesta se saltaba (tester F16 r2 · F-12):
 *
 *  1. **Opt-out** (`fn_can_contact`): Habeas Data, Ley 1581 de 2012. Una
 *     respuesta automática a quien pidió la baja es la peor de todas, porque
 *     nadie la revisa.
 *  2. **Ventana de 24 h de Meta**: fuera de la ventana solo se puede mandar
 *     una plantilla APROBADA, y una respuesta de IA es texto libre. Enviarla
 *     igual es una violación de política del canal.
 *
 * Solo aplica a WhatsApp: el widget, el correo y las redes tienen sus propias
 * reglas y `fn_can_contact` no tiene canal para ellas. Fail-closed: si algo
 * falla, `canContact` ya devuelve false.
 */
export async function canAutoReply(
  params: { orgId: number; conversationId: string; channelType: string | null | undefined; customerId: string | null },
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<AutoReplyGate> {
  if (params.channelType !== 'whatsapp') return { allowed: true };
  if (params.customerId) {
    const ok = await canContact(params.orgId, params.customerId, 'whatsapp', 'utility', supabase);
    if (!ok) return { allowed: false, reason: 'opted_out', message: 'El contacto pidió no recibir WhatsApp (opt-out): la IA no responde' };
  }
  const w = await getWindowByConversation(params.orgId, params.conversationId, supabase, now);
  if (!w.is_open) {
    return { allowed: false, reason: 'window_closed', message: 'La ventana de 24 h de WhatsApp está cerrada: fuera de ella solo se puede enviar una plantilla aprobada' };
  }
  return { allowed: true };
}
