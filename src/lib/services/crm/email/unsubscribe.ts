/**
 * Baja pública (C17): token HMAC(email_message_id + customer_id) firmado con
 * EMAIL_UNSUBSCRIBE_SECRET (fallback: sha256(SUPABASE_SERVICE_ROLE_KEY)).
 * Formato: base64url(JSON{m,c}).hmac_hex[0:32]. Verificación timingSafeEqual.
 *
 * `applyUnsubscribe` escribe contact_consents (opted_out), customers.metadata
 * .do_not_email y email_messages.status='unsubscribed' (sin RPC en BD aún).
 */

import { createHmac, createHash, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';

function secret(): string {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  // La longitud NO basta. El entorno real llevaba
  // `your-email-unsubscribe-secret-16plus`, de 36 caracteres: pasaba esta
  // comprobación, así que el respaldo no llegaba a usarse y los enlaces de baja
  // se firmaban con una cadena escrita en la documentación. Un relleno es peor
  // que no configurar nada: sin configurar se firma con algo secreto; con el
  // relleno se falla ABIERTO con una clave que cualquiera conoce.
  if (s && s.length >= 16 && !isPlaceholderCredential(s)) return s;
  const fb = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!fb) throw new Error('EMAIL_UNSUBSCRIBE_SECRET no configurado');
  return createHash('sha256').update(`unsub:${fb}`).digest('hex');
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}
function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
}

export function signUnsubscribeToken(emailMessageId: string, customerId: string | null): string {
  const payload = b64url(JSON.stringify({ m: emailMessageId, c: customerId ?? null }));
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { email_message_id: string; customer_id: string | null } | null {
  if (!token || token.length > 512) return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!/^[a-f0-9]{32}$/.test(sig)) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(payload)) as { m?: unknown; c?: unknown };
    if (typeof parsed.m !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.m)) return null;
    return { email_message_id: parsed.m, customer_id: typeof parsed.c === 'string' ? parsed.c : null };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.goadmin.io').replace(/\/$/, '');
  return `${base}/u/${token}`;
}

export type OptOutSource = 'list_unsubscribe' | 'one_click' | 'page' | 'hard_bounce' | 'complaint' | 'manual';

/** Marca opted_out para email en contact_consents + customers.metadata (service role). */
export async function applyEmailOptOut(orgId: number, customerId: string, source: OptOutSource, evidence: Record<string, unknown>, service: SupabaseClient): Promise<void> {
  await service.from('contact_consents').upsert(
    { organization_id: orgId, customer_id: customerId, channel: 'email', status: 'opted_out', source, evidence, changed_at: new Date().toISOString() },
    { onConflict: 'organization_id,customer_id,channel' },
  );
  const { data: c } = await service.from('customers').select('metadata').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
  if (c) {
    const meta = ((c as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    await service.from('customers').update({ metadata: { ...meta, do_not_email: true, email_suppressed_reason: source, email_suppressed_at: new Date().toISOString() } }).eq('id', customerId).eq('organization_id', orgId);
  }
}

/**
 * Aplica la baja a partir del token. Devuelve `{ok, org_name}`; responde igual
 * para tokens repetidos (idempotente) y `ok:false` para inválidos.
 */
export async function applyUnsubscribe(token: string, source: OptOutSource, service: SupabaseClient): Promise<{ ok: boolean; org_name?: string }> {
  const v = verifyUnsubscribeToken(token);
  if (!v) return { ok: false };
  const { data: msg } = await service.from('email_messages').select('id, organization_id, to_customer_id, to_email, status, unsubscribed_at').eq('id', v.email_message_id).maybeSingle();
  if (!msg) return { ok: false };
  const m = msg as { id: string; organization_id: number; to_customer_id: string | null; to_email: string; status: string; unsubscribed_at: string | null };
  await service.from('email_messages').update({ status: 'unsubscribed', unsubscribed_at: m.unsubscribed_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', m.id);
  const customerId = m.to_customer_id ?? v.customer_id;
  if (customerId) await applyEmailOptOut(m.organization_id, customerId, source, { email_message_id: m.id, to_email: m.to_email }, service);
  const { data: org } = await service.from('organizations').select('name').eq('id', m.organization_id).maybeSingle();
  return { ok: true, org_name: (org as { name?: string } | null)?.name ?? undefined };
}
