/**
 * Sincronización `message_events` → `campaign_contacts` (FASE-16 §4.3, sin
 * el trigger `fn_campaign_sync_from_event`, que DB aún no creó):
 *  - delivered/read → metadata.state + delivered_at/read_at (+ costo por pricing)
 *  - failed 131049 → skipped:rate_limited_24h (sin reintento 24 h, evidencia en consents)
 *  - failed 131056 / 130429 → vuelve a pending con retry_after (+6 s / +30 s)
 *  - failed otro → failed con error_code
 * Llamado por el webhook (processStatusUpdate) y al inicio de cada lote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnitCost } from '@/lib/services/crm/pricingService';
import { enqueueBatch } from './campaignService';
import { patchCampaignStats } from './campaignStore';
import { contactState, effectiveCampaignStatus, type CampaignConfig, type CampaignContactMeta } from './types';

export interface MessageEventLike {
  message_id: string;
  event_type: string;
  error_code?: string | null;
  error_message?: string | null;
  provider_payload?: { pricing?: { billable?: boolean; category?: string } | null; recipient_id?: string } | null;
  event_time?: string | null;
  created_at?: string | null;
}

export type ProviderErrorAction = { state: 'skipped'; skipped_reason: string; retry_after?: null } | { state: 'pending'; retry_after_ms: number } | { state: 'failed' };

/** Regla pura por código de error de Meta/Twilio. */
export function providerErrorAction(code: string | null | undefined): ProviderErrorAction {
  const c = String(code ?? '');
  if (c === '131049' || c === '131048') return { state: 'skipped', skipped_reason: 'rate_limited_24h' };
  if (c === '131056') return { state: 'pending', retry_after_ms: 6_000 };
  if (c === '130429' || c === '429') return { state: 'pending', retry_after_ms: 30_000 };
  return { state: 'failed' };
}

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, replied: 4 };

/**
 * Un 131056/130429 puede llegar cuando la campaña YA está cerrada (`status
 * 'sent'`): el contacto volvía a `pending` y nadie lo miraba nunca más
 * (tester r1 · fallo 4). Aquí se reabre la campaña y se encola un lote nuevo
 * para la hora del reintento. No toca campañas pausadas/canceladas/borrador ni
 * las que siguen `sending` (esas ya encadenan lotes por su cuenta).
 */
export async function reopenCampaignForRetry(campaignId: string, retryAt: Date, service: SupabaseClient): Promise<{ reopened: boolean; batch_no?: number }> {
  const { data } = await service.from('campaigns').select('id, organization_id, status, statistics').eq('id', campaignId).maybeSingle();
  const row = data as { id: string; organization_id: number; status: string; statistics: CampaignConfig | null } | null;
  if (!row) return { reopened: false };
  const stats = (row.statistics ?? {}) as CampaignConfig;
  if (effectiveCampaignStatus(String(row.status ?? 'draft'), stats) !== 'sent') return { reopened: false };
  const batchNo = Number(stats.next_batch_no ?? 1) || 1;
  await enqueueBatch(row.organization_id, campaignId, batchNo, retryAt, service);
  await patchCampaignStats(campaignId, { finished_at: null, next_batch_no: batchNo }, service, { status: 'sending' });
  return { reopened: true, batch_no: batchNo };
}

export async function applyMessageEventToCampaign(ev: MessageEventLike, service: SupabaseClient): Promise<{ applied: boolean; state?: string }> {
  const { data } = await service.from('campaign_contacts').select('id, campaign_id, customer_id, state, metadata, replied_at').eq('metadata->>message_id', ev.message_id).limit(1).maybeSingle();
  const row = data as { id: string; campaign_id: string; customer_id: string; state: string | null; metadata: CampaignContactMeta | null; replied_at: string | null } | null;
  if (!row) return { applied: false };
  const meta = { ...(row.metadata ?? {}) } as CampaignContactMeta;
  const cur = contactState(row);
  const at = ev.event_time ?? ev.created_at ?? new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let requeuedAt: Date | null = null;
  if (ev.event_type === 'delivered' || ev.event_type === 'read') {
    if (ev.event_type === 'delivered' && !meta.delivered_at) meta.delivered_at = at;
    if (ev.event_type === 'read') { meta.read_at = meta.read_at ?? at; meta.delivered_at = meta.delivered_at ?? at; }
    if ((RANK[ev.event_type] ?? 0) > (RANK[cur] ?? 0) && cur !== 'replied') meta.state = ev.event_type;
    if (ev.event_type === 'delivered' && meta.cost_amount == null) {
      const pricing = ev.provider_payload?.pricing;
      if (pricing?.billable && pricing.category) {
        const cat = pricing.category.toLowerCase() === 'authentication' ? 'utility' : pricing.category.toLowerCase();
        const cc = (ev.provider_payload?.recipient_id ?? meta.recipient ?? '').startsWith('52') ? 'mx' : 'co';
        const unit = await getUnitCost('meta', `wa_${cat}_${cc}`).catch(() => null);
        if (unit !== null) meta.cost_amount = unit;
      } else if (pricing && pricing.billable === false) meta.cost_amount = 0;
    }
    if (row.state !== 'sent' && !row.replied_at) patch.state = 'sent';
  } else if (ev.event_type === 'failed') {
    const action = providerErrorAction(ev.error_code);
    meta.error_code = ev.error_code ?? null;
    meta.error_message = ev.error_message ?? null;
    meta.failed_at = at;
    const attempts = meta.attempts ?? 1;
    if (action.state === 'skipped') { meta.state = 'skipped'; meta.skipped_reason = action.skipped_reason; meta.retry_after = null; }
    else if (action.state === 'pending' && attempts < 3) {
      meta.state = 'pending';
      meta.retry_after = new Date(Date.now() + action.retry_after_ms).toISOString();
      // `message_id` se libera para el reintento, pero se conserva la traza.
      meta.previous_message_id = meta.message_id ?? null;
      meta.message_id = null;
      meta.claim_token = null;
      requeuedAt = new Date(Date.now() + action.retry_after_ms);
    }
    else meta.state = 'failed';
    patch.state = null;
    patch.sent_at = null;
    if (action.state === 'skipped') {
      await service.from('contact_consents').select('id, evidence').eq('customer_id', row.customer_id).eq('channel', 'whatsapp').limit(1).maybeSingle().then(async ({ data: cs }) => {
        const c = cs as { id: string; evidence: Record<string, unknown> | null } | null;
        if (c) await service.from('contact_consents').update({ evidence: { ...(c.evidence ?? {}), meta_131049_until: new Date(Date.now() + 24 * 3600_000).toISOString() } }).eq('id', c.id);
      }, () => undefined);
    }
  } else {
    return { applied: false };
  }
  await service.from('campaign_contacts').update({ ...patch, metadata: meta, updated_at: new Date().toISOString() }).eq('id', row.id);
  if (ev.event_type === 'failed' && ev.error_code) {
    const { data: camp } = await service.from('campaigns').select('statistics').eq('id', row.campaign_id).maybeSingle();
    const stats = ((camp as { statistics?: Record<string, unknown> } | null)?.statistics ?? {}) as Record<string, unknown>;
    const summary = { ...((stats.error_summary as Record<string, number>) ?? {}) };
    summary[ev.error_code] = (summary[ev.error_code] ?? 0) + 1;
    await service.from('campaigns').update({ statistics: { ...stats, error_summary: summary } }).eq('id', row.campaign_id);
  }
  if (requeuedAt) {
    await reopenCampaignForRetry(row.campaign_id, requeuedAt, service).catch(() => ({ reopened: false }));
  }
  return { applied: true, state: meta.state };
}

/** Aplica eventos no vistos de los mensajes enviados de una campaña (respaldo del webhook). */
export async function syncCampaignFromEvents(campaignId: string, service: SupabaseClient): Promise<number> {
  const { data } = await service.from('campaign_contacts').select('id, metadata').eq('campaign_id', campaignId).not('metadata->>message_id', 'is', null).limit(2000);
  const rows = (data ?? []) as Array<{ id: string; metadata: CampaignContactMeta | null }>;
  const ids = rows.map((r) => r.metadata?.message_id).filter((x): x is string => !!x);
  if (!ids.length) return 0;
  let applied = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { data: evs } = await service.from('message_events').select('message_id, event_type, error_code, error_message, provider_payload, event_time, created_at').in('message_id', part).in('event_type', ['delivered', 'read', 'failed']).order('created_at', { ascending: true });
    for (const ev of (evs ?? []) as MessageEventLike[]) {
      const r = await applyMessageEventToCampaign(ev, service);
      if (r.applied) applied += 1;
    }
  }
  return applied;
}

/** Respuesta inbound ≤72 h → replied (fn_campaign_mark_replied + metadata). */
export async function linkInboundReply(orgId: number, customerId: string, messageId: string, service: SupabaseClient): Promise<{ campaign_id: string; opportunity_id: string | null } | null> {
  const since = new Date(Date.now() - 72 * 3600_000).toISOString();
  const { data } = await service.from('campaign_contacts').select('id, campaign_id, metadata, campaigns!inner(organization_id)').eq('customer_id', customerId).eq('campaigns.organization_id', orgId).gt('sent_at', since).is('replied_at', null).order('sent_at', { ascending: false }).limit(1).maybeSingle();
  const row = data as { id: string; campaign_id: string; metadata: CampaignContactMeta | null } | null;
  if (!row) return null;
  await service.rpc('fn_campaign_mark_replied', { p_campaign_id: row.campaign_id, p_customer_id: customerId });
  await service.from('campaign_contacts').update({ metadata: { ...(row.metadata ?? {}), state: 'replied', reply_message_id: messageId }, updated_at: new Date().toISOString() }).eq('id', row.id);
  return { campaign_id: row.campaign_id, opportunity_id: (row.metadata?.opportunity_id as string | null) ?? null };
}
