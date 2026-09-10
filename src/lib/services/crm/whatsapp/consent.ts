/**
 * Consentimiento por canal (contact_consents + customers.metadata.do_not_*).
 * FASE-16 §4.2 `consentService` (ampliación; el `consentService.ts` existente
 * solo cubre grabación de llamadas).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('contact_consents')
    .upsert(
      { organization_id: orgId, customer_id: customerId, channel, status, source, evidence, changed_at: now },
      { onConflict: 'organization_id,customer_id,channel' },
    );
  if (error) throw new Error(`contact_consents upsert: ${error.message}`);

  const flag = channel === 'whatsapp' ? 'do_not_whatsapp' : channel === 'sms' ? 'do_not_sms' : channel === 'email' ? 'do_not_email' : 'do_not_call';
  const { data: c } = await supabase.from('customers').select('metadata').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
  const meta = { ...(((c as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {}) } as Record<string, unknown>;
  if (status === 'opted_out') {
    meta[flag] = true;
    meta[`${channel}_optout_at`] = now;
  } else {
    delete meta[flag];
    if (status === 'opted_in') meta[`${channel}_optin_at`] = now;
  }
  await supabase.from('customers').update({ metadata: meta }).eq('id', customerId).eq('organization_id', orgId);
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
  const { data } = await supabase
    .from('contact_consents')
    .select('id, channel, status, source, evidence, changed_at')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .order('changed_at', { ascending: false });
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

/**
 * Procesa un inbound de WhatsApp: baja/alta por palabra clave o, si es el
 * primer contacto, opt-in implícito (Habeas Data: evidencia = el mensaje).
 * Devuelve la acción aplicada.
 */
export async function applyInboundConsent(
  params: { orgId: number; customerId: string; messageId: string; text: string; optoutKeywords?: string[]; optinKeywords?: string[] },
  supabase: SupabaseClient,
): Promise<'opted_out' | 'opted_in' | 'implicit_opt_in' | 'none'> {
  const { orgId, customerId, messageId, text } = params;
  try {
    if (isOptOutKeyword(text, params.optoutKeywords ?? DEFAULT_OPTOUT_KEYWORDS)) {
      await setConsent(orgId, customerId, 'whatsapp', 'opted_out', 'inbound_keyword', { message_id: messageId, text }, supabase);
      // Contactos pendientes de campañas → skipped (metadata.state; CHECK actual no admite 'skipped')
      await skipPendingCampaignContacts(orgId, customerId, 'opted_out', supabase);
      return 'opted_out';
    }
    if (isOptInKeyword(text, params.optinKeywords ?? DEFAULT_OPTIN_KEYWORDS)) {
      await setConsent(orgId, customerId, 'whatsapp', 'opted_in', 'inbound_keyword', { message_id: messageId }, supabase);
      return 'opted_in';
    }
    const { data: existing } = await supabase
      .from('contact_consents')
      .select('id')
      .eq('organization_id', orgId)
      .eq('customer_id', customerId)
      .eq('channel', 'whatsapp')
      .maybeSingle();
    if (!existing) {
      await supabase.from('contact_consents').insert({
        organization_id: orgId,
        customer_id: customerId,
        channel: 'whatsapp',
        status: 'opted_in',
        source: 'inbound_message',
        evidence: { message_id: messageId },
        changed_at: new Date().toISOString(),
      });
      return 'implicit_opt_in';
    }
  } catch (err) {
    console.warn('[whatsapp/consent] applyInboundConsent:', err instanceof Error ? err.message : err);
  }
  return 'none';
}

async function skipPendingCampaignContacts(orgId: number, customerId: string, reason: string, supabase: SupabaseClient): Promise<void> {
  const { data: rows } = await supabase
    .from('campaign_contacts')
    .select('id, metadata, campaigns!inner(organization_id)')
    .eq('customer_id', customerId)
    .is('state', null)
    .eq('campaigns.organization_id', orgId)
    .limit(200);
  for (const r of (rows ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
    const st = (r.metadata?.state as string | undefined) ?? 'pending';
    if (st !== 'pending' && st !== 'queued') continue;
    await supabase
      .from('campaign_contacts')
      .update({ metadata: { ...(r.metadata ?? {}), state: 'skipped', skipped_reason: reason }, updated_at: new Date().toISOString() })
      .eq('id', r.id);
  }
}
