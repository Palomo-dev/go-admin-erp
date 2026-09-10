/**
 * Webhook de Resend (FASE-07 §4.3) — SOLO servidor, service role.
 *
 * - Firma svix fail-closed (`verifyResendWebhook` de SEC; sin secreto → 401).
 *   Con svix ≥2.2 `Webhook.verify()` devuelve void, así que el helper puede
 *   devolver `undefined`: el body se parsea aquí tras validar la firma.
 * - Idempotencia: provider_event_id = header `svix-id` (UNIQUE en email_events).
 * - Máquina de estados monótona: sent < delivered < opened < clicked;
 *   bounced (Permanent) / complained / unsubscribed / failed terminales; nunca
 *   se baja de rango. Contadores open/click con update optimista + reintento.
 * - Post-efectos: bounce Permanent / complaint → contact_consents opted_out;
 *   campaña → fn_campaign_mark_*; email.received → inboundService.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyResendWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { EMAIL_STATUS_RANK, type EmailMessage, type EmailMessageStatus } from './types';
import { applyEmailOptOut } from './unsubscribe';
import { syncActivityStatus } from './messageStore';
import { refreshDomainByProviderId } from './domainsService';
import { ingestReceivedEmail } from './inboundService';

export interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
    bounce?: { type?: string; subType?: string; message?: string };
    click?: { link?: string; ipAddress?: string; userAgent?: string; timestamp?: string };
    failed?: { reason?: string };
    [k: string]: unknown;
  };
}

export interface WebhookResult {
  processed: boolean;
  duplicate?: boolean;
  event_id?: string;
  reason?: string;
  status?: EmailMessageStatus;
}

const EVENT_TO_STATUS: Record<string, EmailMessageStatus | null> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'failed',
  'email.delivery_delayed': null,
  'email.scheduled': null,
};

export interface Transition {
  status: EmailMessageStatus;
  changed: boolean;
  countOpen: boolean;
  countClick: boolean;
  softBounce: boolean;
  optOut: 'hard_bounce' | 'complaint' | null;
}

/** Pura y testeable: decide el nuevo estado sin degradar. */
export function computeTransition(current: EmailMessageStatus, eventType: string, bounceType?: string | null): Transition {
  const target = EVENT_TO_STATUS[eventType] ?? null;
  const base: Transition = { status: current, changed: false, countOpen: eventType === 'email.opened', countClick: eventType === 'email.clicked', softBounce: false, optOut: null };
  if (!target) return base;
  if (eventType === 'email.bounced' && (bounceType ?? '').toLowerCase() !== 'permanent') {
    return { ...base, softBounce: true };
  }
  const curRank = EMAIL_STATUS_RANK[current] ?? 0;
  const newRank = EMAIL_STATUS_RANK[target] ?? 0;
  const terminalCurrent = curRank >= 8;
  const upgrade = !terminalCurrent && (newRank > curRank || newRank >= 8);
  const optOut = eventType === 'email.bounced' ? 'hard_bounce' : eventType === 'email.complained' ? 'complaint' : null;
  return { ...base, status: upgrade ? target : current, changed: upgrade, optOut };
}

function tagsToObject(tags: ResendWebhookEvent['data']['tags']): Record<string, string> {
  if (!tags) return {};
  if (Array.isArray(tags)) return Object.fromEntries(tags.map((t) => [t.name, t.value]));
  return tags;
}

async function findMessage(evt: ResendWebhookEvent, service: SupabaseClient): Promise<EmailMessage | null> {
  const emailId = evt.data.email_id;
  if (emailId) {
    const { data } = await service.from('email_messages').select('*').eq('provider_message_id', emailId).maybeSingle();
    if (data) return data as EmailMessage;
  }
  const local = tagsToObject(evt.data.tags).email_message_id;
  if (local && /^[0-9a-f-]{36}$/i.test(local)) {
    const { data } = await service.from('email_messages').select('*').eq('id', local).maybeSingle();
    if (data) return data as EmailMessage;
  }
  return null;
}

export interface AppliedTransition {
  status: EmailMessageStatus;
  /** false = se agotaron los reintentos del CAS y NO se escribió nada. */
  applied: boolean;
}

/**
 * Aplica contadores/fechas con update optimista (3 intentos).
 * Si los 3 fallan devuelve `applied:false`: el llamador debe deshacer la fila de
 * `email_events` y responder con un error para que Resend reintente. Antes se
 * devolvía 200 en silencio y el contador se perdía para siempre (tester r1 #7).
 */
async function applyTransition(msg: EmailMessage, t: Transition, occurredAt: string, evt: ResendWebhookEvent, service: SupabaseClient): Promise<AppliedTransition> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: freshRow } = await service.from('email_messages').select('*').eq('id', msg.id).maybeSingle();
    const fresh = (freshRow as EmailMessage | null) ?? msg;
    const tr = computeTransition(fresh.status, evt.type, evt.data.bounce?.type ?? null);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const meta = { ...(fresh.metadata ?? {}) };
    if (tr.changed) patch.status = tr.status;
    if (tr.status === 'delivered' && tr.changed) patch.delivered_at = fresh.delivered_at ?? occurredAt;
    if (tr.countOpen) {
      patch.open_count = (fresh.open_count ?? 0) + 1;
      patch.first_opened_at = fresh.first_opened_at ?? occurredAt;
    }
    if (tr.countClick) {
      patch.click_count = (fresh.click_count ?? 0) + 1;
      patch.first_clicked_at = fresh.first_clicked_at ?? occurredAt;
      if (evt.data.click?.link) meta.last_click_link = evt.data.click.link;
    }
    if (evt.type === 'email.bounced') {
      patch.bounced_at = fresh.bounced_at ?? occurredAt;
      if (tr.softBounce) meta.soft_bounces = Number(meta.soft_bounces ?? 0) + 1;
      else patch.bounce_type = 'hard';
      if (evt.data.bounce?.message) meta.last_error = String(evt.data.bounce.message).slice(0, 500);
    }
    if (evt.type === 'email.complained') patch.complained_at = fresh.complained_at ?? occurredAt;
    if (evt.type === 'email.failed' || evt.type === 'email.suppressed') {
      meta.failed_at = meta.failed_at ?? occurredAt;
      meta.last_error = String(evt.data.failed?.reason ?? evt.type).slice(0, 500);
    }
    if (evt.type === 'email.delivery_delayed') meta.delayed_at = occurredAt;
    if (evt.type === 'email.sent' && !fresh.sent_at) patch.sent_at = occurredAt;
    patch.metadata = meta;
    const { data: updated, error } = await service
      .from('email_messages')
      .update(patch)
      .eq('id', msg.id)
      .eq('status', fresh.status)
      .eq('open_count', fresh.open_count ?? 0)
      .eq('click_count', fresh.click_count ?? 0)
      .select('status');
    if (updated && updated.length > 0) return { status: tr.status, applied: true };
    // Sin el error, un fallo de BD real se veía como "conflicto de CAS" y el log
    // no decía la causa (tester r2 #8).
    if (error) lastError = error.message;
  }
  console.error('[emailWebhook] update optimista agotó los 3 reintentos; se devuelve 503 para que Resend reintente', { email_message_id: msg.id, event_type: evt.type, causa: lastError ?? 'conflicto de concurrencia (CAS)' });
  return { status: msg.status, applied: false };
}

async function postEffects(msg: EmailMessage, t: Transition, status: EmailMessageStatus, evt: ResendWebhookEvent, service: SupabaseClient): Promise<void> {
  if (t.optOut && msg.to_customer_id) {
    await applyEmailOptOut(msg.organization_id, msg.to_customer_id, t.optOut, { email_message_id: msg.id, to_email: msg.to_email, bounce: evt.data.bounce ?? null }, service).catch((e) => console.warn('[emailWebhook] opt-out falló', e));
  }
  await syncActivityStatus(msg.id, status, service).catch(() => undefined);
  const campaignId = msg.metadata?.campaign_id;
  if (campaignId && msg.to_customer_id) {
    const fn = evt.type === 'email.delivered' || evt.type === 'email.sent' ? 'fn_campaign_mark_sent' : evt.type === 'email.opened' ? 'fn_campaign_mark_opened' : evt.type === 'email.clicked' ? 'fn_campaign_mark_clicked' : evt.type === 'email.bounced' ? 'fn_campaign_mark_bounced' : null;
    if (fn) await service.rpc(fn, { p_campaign_id: campaignId, p_customer_id: msg.to_customer_id }).then(() => undefined, () => undefined);
  }
}

function parseVerifiedBody(rawBody: string): ResendWebhookEvent {
  try {
    return JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    throw new WebhookError(400, 'invalid_json');
  }
}

export async function handleEmailWebhook(rawBody: string, headers: Record<string, string>, service: SupabaseClient): Promise<WebhookResult> {
  const svixHeaders = {
    'svix-id': headers['svix-id'] || headers['webhook-id'] || '',
    'svix-timestamp': headers['svix-timestamp'] || headers['webhook-timestamp'] || '',
    'svix-signature': headers['svix-signature'] || headers['webhook-signature'] || '',
  };
  // `svix` ≥2 cambió la firma de `Webhook.verify()`: valida y devuelve `void`
  // (en 1.x devolvía el payload parseado), así que `verifyResendWebhook` puede
  // devolver `undefined` con firma correcta. Se parsea aquí, SIEMPRE después
  // de que la verificación haya pasado — nunca antes.
  const verified = verifyResendWebhook<ResendWebhookEvent | undefined>(rawBody, svixHeaders);
  const evt = verified ?? parseVerifiedBody(rawBody);
  if (!evt || typeof evt.type !== 'string' || typeof evt.data !== 'object' || evt.data === null) {
    throw new WebhookError(400, 'invalid_payload');
  }
  const occurredAt = evt.created_at || new Date().toISOString();
  const providerEventId = svixHeaders['svix-id'] || `${evt.type}-${evt.data?.email_id ?? evt.data?.id ?? ''}-${occurredAt}`;

  if (evt.type.startsWith('domain.')) {
    if (evt.data?.id) await refreshDomainByProviderId(String(evt.data.id), service).catch((e) => console.warn('[emailWebhook] domain refresh', e));
    return { processed: true, reason: evt.type };
  }
  if (evt.type === 'email.received') {
    const r = await ingestReceivedEmail(String(evt.data.email_id ?? evt.data.id ?? ''), evt.data.to ?? [], service, providerEventId);
    return { processed: !!r.email_message_id, reason: r.reason };
  }

  const msg = await findMessage(evt, service);
  if (!msg) return { processed: false, reason: 'message_not_found' };

  const { data: inserted, error: evErr } = await service
    .from('email_events')
    .insert({ organization_id: msg.organization_id, email_message_id: msg.id, event_type: evt.type, occurred_at: occurredAt, payload: evt as unknown as Record<string, unknown>, provider_event_id: providerEventId })
    .select('id')
    .maybeSingle();
  if (evErr) {
    if (evErr.code === '23505') return { processed: false, duplicate: true, reason: 'duplicate_event' };
    throw new Error(`email_events insert: ${evErr.message}`);
  }

  const eventRowId = (inserted as { id: string } | null)?.id;
  const t = computeTransition(msg.status, evt.type, evt.data.bounce?.type ?? null);
  const applied = await applyTransition(msg, t, occurredAt, evt, service);
  if (!applied.applied) {
    // Se deshace la fila de `email_events` para que el reintento de Resend no
    // choque con el UNIQUE de `provider_event_id` y el contador no se pierda.
    if (eventRowId) {
      const { error: delErr } = await service.from('email_events').delete().eq('id', eventRowId);
      if (delErr) console.error('[emailWebhook] no se pudo deshacer email_events tras el conflicto de CAS', eventRowId, delErr.message);
    }
    throw new WebhookError(503, 'transition_conflict', `No se pudo aplicar ${evt.type} sobre ${msg.id} tras 3 intentos`);
  }
  await postEffects(msg, t, applied.status, evt, service);
  return { processed: true, event_id: eventRowId, status: applied.status };
}
