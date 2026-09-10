/**
 * Envío de email v2 (FASE-07 §4.2) — SOLO servidor.
 *
 * Orden (cada paso falla cerrado): validar → fn_can_contact → resolveSender →
 * buildContext → renderEmail → variables faltantes (strict) → INSERT
 * email_messages (id generado, idempotency_key='email/{id}', status pending)
 * → 1 activity → programado (>1 h → outbound_jobs kind 'email'; ≤1 h →
 * scheduledAt de Resend) → adjuntos → rate limit 10 req/s →
 * resend.emails.send(payload, { idempotencyKey }) → UPDATE sent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { EmailError, MAX_RECIPIENTS, MAX_SCHEDULE_DAYS, RESEND_SCHEDULE_WINDOW_MS, type EmailKind, type EmailMessage, type EmailMessageMeta } from './types';
import { resolveSender, type ResolvedSender } from './domainsService';
import { getResendClient, getResendRateLimiter } from './resendClient';
import { renderEmail, type RenderOutput } from './render';
import { buildContext, type RenderContext } from './variables';
import { loadAttachments, refsToInputs, toRefs, type AttachmentInput, type LoadedAttachment } from './attachments';
import { signUnsubscribeToken, unsubscribeUrl } from './unsubscribe';
import { buildIdempotencyKey, findByClientRequestId, insertMessage, isUuid, markFailed, mergeMeta, messageId, requireMessage, upsertEmailActivity } from './messageStore';
import { requireTemplate, touchTemplateUsage } from './templatesService';

export type SendContent =
  | { template_id: string; variables?: Record<string, unknown> }
  | { blocks: Record<string, unknown>; variables?: Record<string, unknown> }
  | { html: string; text?: string; variables?: Record<string, unknown> };

export interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  to_customer_id?: string | null;
  from_domain_id?: string | null;
  from_user_id?: string | null;
  subject?: string;
  preheader?: string;
  content: SendContent;
  attachments?: AttachmentInput[];
  related_type?: 'opportunity' | 'customer' | 'quotation' | 'contract' | string;
  related_id?: string;
  kind?: EmailKind;
  scheduled_at?: string | null;
  sequence_step_run_id?: string | null;
  campaign_id?: string | null;
  client_request_id?: string | null;
  strict_variables?: boolean;
  tags?: Array<{ name: string; value: string }>;
  metadata?: Record<string, unknown>;
  in_reply_to?: string | null;
  /** Prueba: kind 'system', tag test, sin fn_can_contact (la ruta acota el `to`). Sí deja activity. */
  test?: boolean;
}

export interface SendEmailResult {
  message: EmailMessage;
  scheduled: boolean;
  warnings: string[];
  missing: string[];
}

export interface SendEmailActor {
  userId: string | null;
  userEmail?: string | null;
  orgName?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmails(list: unknown, label: string): string[] {
  const arr = Array.isArray(list) ? list : typeof list === 'string' && list ? [list] : [];
  const out = arr.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  for (const e of out) if (!EMAIL_RE.test(e)) throw new EmailError('VALIDATION', `Dirección inválida en ${label}: ${e}`, 400);
  return Array.from(new Set(out));
}

function tagValue(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
}

function msgIdHeader(id: string, domain: string | null): string {
  return `<${id}@${domain ?? 'goadmin.local'}>`;
}

export async function canContact(orgId: number, customerId: string, supabase: SupabaseClient, purpose: EmailKind): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_can_contact', { p_org: orgId, p_customer: customerId, p_channel: 'email', p_purpose: purpose === 'marketing' ? 'marketing' : 'utility' });
  if (error) {
    console.warn('[email] fn_can_contact falló, se bloquea por seguridad:', error.message);
    return false;
  }
  return data === true;
}

async function renderContent(orgId: number, req: SendEmailRequest, ctx: RenderContext, supabase: SupabaseClient): Promise<{ rendered: RenderOutput; templateId: string | null }> {
  const c = req.content;
  if ('template_id' in c) {
    const t = await requireTemplate(orgId, c.template_id, supabase);
    if (!t.is_active) throw new EmailError('NOT_FOUND', 'La plantilla está desactivada', 404);
    return { rendered: await renderEmail({ template: t }, { ctx, subject: req.subject, preheader: req.preheader }), templateId: t.id };
  }
  if ('blocks' in c) return { rendered: await renderEmail({ blocks: c.blocks }, { ctx, subject: req.subject ?? '', preheader: req.preheader ?? '' }), templateId: null };
  if ('html' in c) return { rendered: await renderEmail({ html: c.html, text: c.text }, { ctx, subject: req.subject ?? '', preheader: req.preheader ?? '' }), templateId: null };
  throw new EmailError('VALIDATION', 'content debe tener template_id, blocks o html', 400);
}

/** Construye el payload de Resend (nombres camelCase del SDK 6.26). */
export function buildResendPayload(msg: EmailMessage, sender: ResolvedSender, attachments: LoadedAttachment[], scheduledAt?: string) {
  const meta = msg.metadata ?? {};
  const domainHost = sender.receivingDomain ?? sender.domain?.domain ?? null;
  const headers: Record<string, string> = { 'Message-ID': msgIdHeader(msg.id, domainHost), 'X-Email-Message-Id': msg.id };
  if (meta.in_reply_to) {
    headers['In-Reply-To'] = msgIdHeader(meta.in_reply_to, domainHost);
    headers.References = msgIdHeader(meta.thread_id ?? meta.in_reply_to, domainHost);
  }
  if ((meta.kind === 'marketing' || meta.kind === 'sequence') && meta.list_unsubscribe_token) {
    const url = unsubscribeUrl(meta.list_unsubscribe_token);
    const mailto = domainHost ? `<mailto:unsubscribe@${domainHost}?subject=unsub-${meta.list_unsubscribe_token}>, ` : '';
    headers['List-Unsubscribe'] = `${mailto}<${url}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const tags = [
    { name: 'tenant_id', value: String(msg.organization_id) },
    { name: 'email_message_id', value: msg.id },
    ...(msg.related_type && msg.related_id ? [{ name: 'related', value: tagValue(`${msg.related_type}:${msg.related_id}`) }] : []),
    ...(meta.test ? [{ name: 'test', value: 'true' }] : []),
  ];
  return {
    from: sender.from,
    to: [msg.to_email, ...((msg.metadata?.extra_to as string[] | undefined) ?? [])],
    cc: msg.cc ?? undefined,
    bcc: msg.bcc ?? undefined,
    replyTo: meta.reply_to ?? undefined,
    subject: msg.subject,
    html: msg.body_html_snapshot ?? '',
    text: meta.body_text_snapshot ?? undefined,
    headers,
    tags,
    attachments: attachments.length ? attachments.map((a) => ({ filename: a.filename, content: a.base64, contentType: a.content_type })) : undefined,
    scheduledAt,
  };
}

/** Llama a Resend con rate limit y actualiza la fila. Lanza EmailError('PROVIDER') si falla. */
export async function deliver(msg: EmailMessage, sender: ResolvedSender, attachments: LoadedAttachment[], supabase: SupabaseClient, scheduledAt?: string): Promise<EmailMessage> {
  const resend = getResendClient(sender.apiKey);
  await getResendRateLimiter().wait();
  const payload = buildResendPayload(msg, sender, attachments, scheduledAt);
  const { data, error } = await resend.emails.send(payload as Parameters<typeof resend.emails.send>[0], { idempotencyKey: buildIdempotencyKey(msg.id) });
  if (error || !data) {
    const failed = await markFailed(msg, `Resend: ${error?.name ?? ''} ${error?.message ?? 'sin respuesta'}`.trim(), supabase);
    throw new EmailError('PROVIDER', `Resend: ${error?.message ?? 'sin respuesta'}`, 502, { message: failed });
  }
  const now = new Date().toISOString();
  const updated = scheduledAt
    ? await mergeMeta(msg, { scheduled: true, provider_scheduled: true }, { provider_message_id: data.id }, supabase)
    : await mergeMeta(msg, { scheduled: false }, { provider_message_id: data.id, status: 'sent', sent_at: now }, supabase);
  return updated;
}

export async function sendEmail(orgId: number, actor: SendEmailActor, req: SendEmailRequest, supabase: SupabaseClient): Promise<SendEmailResult> {
  const warnings: string[] = [];
  const to = cleanEmails(req.to, 'to');
  const cc = cleanEmails(req.cc, 'cc');
  const bcc = cleanEmails(req.bcc, 'bcc');
  if (to.length === 0) throw new EmailError('VALIDATION', 'Se requiere al menos un destinatario', 400);
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) throw new EmailError('TOO_MANY_RECIPIENTS', `Máximo ${MAX_RECIPIENTS} destinatarios`, 400);
  const kind: EmailKind = req.test ? 'system' : (req.kind ?? 'transactional');
  const userId = req.from_user_id ?? actor.userId;

  if (req.client_request_id) {
    const dup = await findByClientRequestId(orgId, req.client_request_id, supabase);
    if (dup) return { message: dup, scheduled: !!dup.metadata?.scheduled, warnings: ['duplicate_client_request'], missing: [] };
  }

  let scheduledAtIso: string | null = null;
  if (req.scheduled_at) {
    const d = new Date(req.scheduled_at);
    if (Number.isNaN(d.getTime())) throw new EmailError('VALIDATION', 'scheduled_at inválido', 400);
    if (d.getTime() - Date.now() > MAX_SCHEDULE_DAYS * 86400000) throw new EmailError('VALIDATION', `scheduled_at no puede superar ${MAX_SCHEDULE_DAYS} días`, 400);
    if (d.getTime() > Date.now() + 60000) scheduledAtIso = d.toISOString();
  }

  let customerId = isUuid(req.to_customer_id) ? req.to_customer_id : null;
  if (!customerId) {
    const { data: c } = await supabase.from('customers').select('id').eq('organization_id', orgId).ilike('email', to[0]).limit(1).maybeSingle();
    if (c) customerId = (c as { id: string }).id;
  }
  if (customerId && !req.test && !(await canContact(orgId, customerId, supabase, kind))) {
    throw new EmailError('CONTACT_OPTED_OUT', 'El contacto pidió no recibir correos', 403);
  }

  const sender = await resolveSender(orgId, { domainId: req.from_domain_id ?? null, userId, kind, orgName: actor.orgName, userEmail: actor.userEmail ?? null }, supabase);
  if (sender.notice) warnings.push(sender.notice);

  const id = messageId();
  const opportunityId = req.related_type === 'opportunity' && isUuid(req.related_id) ? req.related_id : null;
  const ctx = await buildContext(orgId, { customerId, opportunityId, userId, custom: req.content.variables ?? {} }, supabase);
  ctx.sender_notice = sender.notice;
  const unsubToken = kind === 'marketing' || kind === 'sequence' ? signUnsubscribeToken(id, customerId) : null;
  if (unsubToken) ctx.unsubscribe_url = unsubscribeUrl(unsubToken);

  const { rendered, templateId } = await renderContent(orgId, req, ctx, supabase);
  if (!rendered.subject) throw new EmailError('VALIDATION', 'El asunto es obligatorio', 400);
  const hardMissing = rendered.missing.filter((m) => !m.startsWith('raw:'));
  if (req.strict_variables !== false && hardMissing.length > 0 && !req.test) {
    throw new EmailError('MISSING_VARIABLES', `Variables sin valor: ${hardMissing.join(', ')}`, 422, { missing: hardMissing });
  }
  if (hardMissing.length) warnings.push(`Variables vacías: ${hardMissing.join(', ')}`);

  const replyTo = sender.receivingDomain ? `crm+${id}@${sender.receivingDomain}` : sender.replyTo;
  const threadId = req.in_reply_to ? ((req.metadata?.thread_id as string | undefined) ?? req.in_reply_to) : id;
  const meta: EmailMessageMeta = {
    ...(req.metadata ?? {}), direction: 'outbound', kind, preheader: rendered.preheader, in_reply_to: req.in_reply_to ?? null, thread_id: threadId,
    list_unsubscribe_token: unsubToken ?? undefined, from_user_id: userId, email_domain_id: sender.domain?.id ?? null, sender_mode: sender.mode,
    body_text_snapshot: rendered.text, client_request_id: req.client_request_id ?? undefined, reply_to: replyTo ?? undefined,
    scheduled: !!scheduledAtIso, missing_variables: hardMissing.length ? hardMissing : undefined, test: req.test || undefined,
    campaign_id: req.campaign_id ?? undefined, extra_to: to.length > 1 ? to.slice(1) : undefined, attachments: [],
  };
  const message = await insertMessage({
    id, organization_id: orgId, provider: 'resend', template_id: templateId, to_email: to[0], to_customer_id: customerId, cc: cc.length ? cc : null, bcc: bcc.length ? bcc : null,
    from_email: sender.fromEmail, subject: rendered.subject, body_html_snapshot: rendered.html, related_type: req.related_type ?? null, related_id: req.related_id ?? null,
    sequence_step_run_id: req.sequence_step_run_id ?? null, status: 'pending', scheduled_at: scheduledAtIso, idempotency_key: buildIdempotencyKey(id), metadata: meta,
  }, supabase);

  // También se registra la activity de los envíos de prueba (tester r1 #8).
  await upsertEmailActivity(
    message,
    { userId, direction: 'outbound', notes: req.test ? `Prueba de plantilla a ${to[0]}: "${rendered.subject}"` : undefined },
    supabase,
  );
  if (templateId) touchTemplateUsage(orgId, templateId, supabase).catch(() => undefined);

  let attachments: LoadedAttachment[] = [];
  try {
    attachments = await loadAttachments(orgId, req.attachments, Buffer.byteLength(rendered.html), supabase);
  } catch (err) {
    await markFailed(message, err instanceof Error ? err.message : 'attachments', supabase);
    throw err;
  }
  const withRefs = attachments.length ? await mergeMeta(message, { attachments: toRefs(attachments) }, {}, supabase) : message;

  if (scheduledAtIso && new Date(scheduledAtIso).getTime() - Date.now() > RESEND_SCHEDULE_WINDOW_MS) {
    const jobId = await enqueueJob({ organizationId: orgId, kind: 'email', payload: { email_message_id: id }, runAt: scheduledAtIso, dedupeKey: buildIdempotencyKey(id) });
    const scheduled = await mergeMeta(withRefs, { scheduled: true, scheduled_job_id: jobId }, {}, supabase);
    return { message: scheduled, scheduled: true, warnings, missing: hardMissing };
  }
  const sent = await deliver(withRefs, sender, attachments, supabase, scheduledAtIso ?? undefined);
  return { message: sent, scheduled: !!scheduledAtIso, warnings, missing: hardMissing };
}

/** Job `email`: reenvía un correo programado (>1 h) re-comprobando consentimiento. */
export async function dispatchScheduledEmail(emailMessageId: string, service: SupabaseClient): Promise<{ sent: boolean; reason?: string }> {
  const { data } = await service.from('email_messages').select('*').eq('id', emailMessageId).maybeSingle();
  const msg = data as EmailMessage | null;
  if (!msg) return { sent: false, reason: 'not_found' };
  if (msg.status !== 'pending' || msg.provider_message_id) return { sent: false, reason: `status_${msg.status}` };
  if (msg.metadata?.canceled_at) return { sent: false, reason: 'canceled' };
  const kind = msg.metadata?.kind ?? 'transactional';
  if (msg.to_customer_id && !(await canContact(msg.organization_id, msg.to_customer_id, service, kind))) {
    await markFailed(msg, 'CONTACT_OPTED_OUT', service);
    return { sent: false, reason: 'opted_out' };
  }
  const sender = await resolveSender(msg.organization_id, { domainId: msg.metadata?.email_domain_id ?? null, userId: msg.metadata?.from_user_id ?? null, kind }, service);
  const attachments = await loadAttachments(msg.organization_id, refsToInputs(msg.metadata?.attachments), Buffer.byteLength(msg.body_html_snapshot ?? ''), service);
  await deliver(msg, sender, attachments, service);
  return { sent: true };
}

/** Cancela un correo programado (Resend ≤1 h o job propio). */
export async function cancelScheduledEmail(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient): Promise<EmailMessage> {
  const msg = await requireMessage(orgId, id, supabase);
  if (!msg.metadata?.scheduled || msg.status !== 'pending') throw new EmailError('NOT_SCHEDULED', 'El correo no está programado', 409);
  if (msg.provider_message_id) {
    const sender = await resolveSender(orgId, { domainId: msg.metadata.email_domain_id ?? null, kind: msg.metadata.kind ?? 'transactional' }, supabase);
    const { error } = await getResendClient(sender.apiKey).emails.cancel(msg.provider_message_id);
    if (error) throw new EmailError('PROVIDER', `Resend cancel: ${error.message}`, 502);
  }
  if (msg.metadata.scheduled_job_id) {
    await service.from('outbound_jobs').update({ status: 'dead', last_error: 'canceled_by_user', updated_at: new Date().toISOString() }).eq('id', msg.metadata.scheduled_job_id).eq('organization_id', orgId).in('status', ['queued']);
  }
  return mergeMeta(msg, { canceled_at: new Date().toISOString(), scheduled: false, last_error: 'canceled' }, { status: 'failed' }, supabase);
}

/** Responde a un correo (hilo): fija in_reply_to/thread_id y destinatario del original. */
export async function replyToEmail(orgId: number, actor: SendEmailActor, id: string, req: Partial<SendEmailRequest> & { content: SendContent }, supabase: SupabaseClient): Promise<SendEmailResult> {
  const original = await requireMessage(orgId, id, supabase);
  const inbound = original.metadata?.direction === 'inbound';
  const to = req.to?.length ? req.to : [inbound ? original.from_email : original.to_email];
  const subject = req.subject ?? (original.subject.toLowerCase().startsWith('re:') ? original.subject : `Re: ${original.subject}`);
  return sendEmail(orgId, actor, {
    ...req, to, subject, content: req.content, to_customer_id: req.to_customer_id ?? original.to_customer_id,
    related_type: req.related_type ?? original.related_type ?? undefined, related_id: req.related_id ?? original.related_id ?? undefined,
    in_reply_to: original.id, metadata: { ...(req.metadata ?? {}), thread_id: original.metadata?.thread_id ?? original.id },
    from_domain_id: req.from_domain_id ?? original.metadata?.email_domain_id ?? null, kind: req.kind ?? 'transactional',
  }, supabase);
}
