/**
 * Inbound (Resend Receiving, FASE-07 §4.3 paso 6) — SOLO servidor.
 *
 * email.received → resend.emails.receiving.get(id, {html_format:'cid'}) →
 * email_messages (metadata.direction='inbound', status 'delivered' porque el
 * CHECK aún no admite 'received') + activity + notificación al vendedor +
 * adjuntos en `documents` (bucket crm-documents).
 *
 * Enrutamiento: `crm+{email_message_id}@dominio` (reply_to) → org/relación
 * heredadas; si no, dominio destino verificado → inbound sin relación.
 * Nunca "primera org".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMasterResend, getMasterResendKey } from './resendClient';
import { sanitizeInboundHtml, htmlToText } from './sanitize';
import type { EmailMessage } from './types';
import { insertMessage, upsertEmailActivity } from './messageStore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReplyAddress(address: string): { email_message_id: string; domain: string } | null {
  const m = /<?\s*crm\+([0-9a-f-]{36})@([a-z0-9.-]+)\s*>?$/i.exec(address.trim());
  if (!m || !UUID_RE.test(m[1])) return null;
  return { email_message_id: m[1], domain: m[2].toLowerCase() };
}

function parseAddress(raw: string): { email: string; name: string } {
  const m = /^(.*?)<([^>]+)>$/.exec(raw.trim());
  if (m) return { name: m[1].replace(/"/g, '').trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: raw.trim().toLowerCase() };
}

interface Routing {
  orgId: number;
  original: EmailMessage | null;
  domain: string | null;
}

/** Dominio global de GoAdmin (fallback de remitente/Reply-To). */
function globalDomain(): string {
  return (process.env.EMAIL_GLOBAL_DOMAIN?.trim() || process.env.EMAIL_FROM_ADDRESS?.split('@')[1] || '').toLowerCase();
}

/**
 * ¿El dominio de `crm+{uuid}@dominio` pertenece de verdad a la org del mensaje?
 *
 * Sin esta comprobación (tester r1 #5), un tenant con su propio dominio
 * verificado que reciba un correo dirigido a `crm+{uuid-de-otra-org}@su-dominio`
 * generaría fila, activity y notificación EN LA ORG VÍCTIMA. Se valida contra
 * el `reply_to` que nosotros mismos emitimos (fuente de verdad) y, si el
 * mensaje no lo tiene registrado, contra `email_domains` de esa org (solo
 * `verified`: una fila `pending` la crea cualquiera — tester r2 #8) o el
 * dominio global.
 */
export async function domainMatchesOrg(domain: string, msg: EmailMessage, service: SupabaseClient): Promise<boolean> {
  const expected = String(msg.metadata?.reply_to ?? '').split('@')[1]?.trim().toLowerCase();
  if (expected) return expected === domain;
  if (domain === globalDomain()) return true;
  const { data } = await service
    .from('email_domains')
    .select('id')
    .eq('organization_id', msg.organization_id)
    .eq('domain', domain)
    .eq('status', 'verified')
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function route(to: string[], service: SupabaseClient): Promise<Routing | null> {
  for (const addr of to) {
    const parsed = parseReplyAddress(addr);
    if (!parsed) continue;
    const { data } = await service.from('email_messages').select('*').eq('id', parsed.email_message_id).maybeSingle();
    if (!data) continue;
    const original = data as EmailMessage;
    if (!(await domainMatchesOrg(parsed.domain, original, service))) {
      console.warn('[emailInbound] dominio ajeno a la org del mensaje, se descarta el enrutado por reply-to', parsed.domain, original.organization_id);
      continue;
    }
    return { orgId: original.organization_id, original, domain: parsed.domain };
  }
  for (const addr of to) {
    const domain = parseAddress(addr).email.split('@')[1];
    if (!domain) continue;
    const { data } = await service.from('email_domains').select('organization_id').eq('domain', domain).eq('status', 'verified').limit(1).maybeSingle();
    if (data) return { orgId: (data as { organization_id: number }).organization_id, original: null, domain };
  }
  return null;
}

async function storeAttachments(orgId: number, msg: EmailMessage, resendEmailId: string, atts: Array<{ id: string; filename: string | null; content_type: string; size: number }>, service: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  const resend = getMasterResend();
  const relatedType = msg.related_type ?? 'customer';
  const relatedId = msg.related_id ?? msg.to_customer_id ?? msg.id;
  for (const a of atts) {
    try {
      const { data } = await resend.emails.receiving.attachments.get({ emailId: resendEmailId, id: a.id });
      if (!data?.download_url) continue;
      const res = await fetch(data.download_url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = (a.filename ?? data.filename ?? `adjunto-${a.id}`).replace(/[^\w.\-() ]/g, '_');
      const path = `${orgId}/${relatedType}/${relatedId}/${Date.now()}-${filename}`;
      const { error: upErr } = await service.storage.from('crm-documents').upload(path, buf, { contentType: a.content_type, upsert: false });
      if (upErr) continue;
      const { data: doc } = await service.from('documents').insert({
        organization_id: orgId, name: filename, file_path: path, file_type: filename.split('.').pop()?.toLowerCase() ?? 'bin', file_size: buf.length, mime_type: a.content_type,
        uploaded_by: null, related_type: relatedType, related_id: String(relatedId), tags: ['email', 'inbound'], is_confidential: false,
      }).select('id').single();
      if (doc) ids.push((doc as { id: string }).id);
    } catch (err) {
      console.warn('[emailInbound] adjunto falló', a.id, err instanceof Error ? err.message : err);
    }
  }
  return ids;
}

export async function ingestReceivedEmail(resendEmailId: string, to: string[], service: SupabaseClient, providerEventId?: string): Promise<{ email_message_id: string | null; reason?: string }> {
  if (!resendEmailId) return { email_message_id: null, reason: 'no_email_id' };
  if (!getMasterResendKey()) return { email_message_id: null, reason: 'no_master_key' };
  const { data: dup } = await service.from('email_messages').select('id').contains('metadata', { provider_inbound_id: resendEmailId }).limit(1).maybeSingle();
  if (dup) return { email_message_id: (dup as { id: string }).id, reason: 'duplicate' };

  const routing = await route(to, service);
  if (!routing) return { email_message_id: null, reason: 'unrouted' };

  const { data: mail, error } = await getMasterResend().emails.receiving.get(resendEmailId, { html_format: 'cid' });
  if (error || !mail) return { email_message_id: null, reason: `provider:${error?.message ?? 'sin datos'}` };

  const from = parseAddress(mail.from);
  const original = routing.original;
  let customerId = original?.to_customer_id ?? null;
  if (!customerId) {
    const { data: c } = await service.from('customers').select('id').eq('organization_id', routing.orgId).ilike('email', from.email).limit(1).maybeSingle();
    customerId = (c as { id: string } | null)?.id ?? null;
  }
  // Entrante = autor no confiable: sin <style> y con la allow-list de esquemas.
  const html = sanitizeInboundHtml(mail.html ?? '');
  const text = mail.text ?? htmlToText(html);
  const inserted = await insertMessage({
    organization_id: routing.orgId, provider: 'resend', provider_message_id: null, to_email: parseAddress(mail.to?.[0] ?? to[0] ?? '').email, to_customer_id: customerId,
    from_email: from.email, subject: mail.subject || '(sin asunto)', body_html_snapshot: html, related_type: original?.related_type ?? null, related_id: original?.related_id ?? null,
    status: 'delivered', delivered_at: mail.created_at ?? new Date().toISOString(), idempotency_key: `inbound/${resendEmailId}`,
    metadata: {
      direction: 'inbound', kind: 'transactional', provider_inbound_id: resendEmailId, in_reply_to: original?.id ?? null, thread_id: original?.metadata?.thread_id ?? original?.id ?? undefined,
      received_at: mail.created_at ?? new Date().toISOString(), body_text_snapshot: text, from_name: from.name, from_user_id: original?.metadata?.from_user_id ?? null,
      provider_message_header_id: mail.message_id, provider_event_id: providerEventId ?? null, attachments: (mail.attachments ?? []).map((a) => ({ filename: a.filename ?? '', content_type: a.content_type, bytes: a.size })),
    },
  }, service);
  if (!inserted.metadata?.thread_id) await service.from('email_messages').update({ metadata: { ...inserted.metadata, thread_id: inserted.id } }).eq('id', inserted.id);

  const sellerId = original?.metadata?.from_user_id ?? null;
  await upsertEmailActivity(inserted, { userId: sellerId, direction: 'inbound' }, service);
  await service.rpc('fn_create_org_notification', {
    p_organization_id: routing.orgId, p_recipient_user_id: sellerId, p_channel: 'app', p_type: 'email_reply',
    p_title: `Respondió ${from.name || from.email}`, p_content: `${mail.subject || ''}: ${text.slice(0, 140)}`.trim(),
    p_metadata: { email_message_id: inserted.id, related_type: inserted.related_type, related_id: inserted.related_id },
  }).then(() => undefined, (e: unknown) => console.warn('[emailInbound] notificación falló', e));

  if (mail.attachments?.length) {
    const docIds = await storeAttachments(routing.orgId, inserted, resendEmailId, mail.attachments, service);
    if (docIds.length) await service.from('email_messages').update({ metadata: { ...inserted.metadata, document_ids: docIds } }).eq('id', inserted.id);
  }
  return { email_message_id: inserted.id };
}
