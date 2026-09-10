/**
 * Materialización de audiencias (FASE-16 §2.3, §3.1 `fn_campaign_materialize`).
 *
 * `fn_campaign_materialize` / `fn_segment_customers` NO existen en BD → se
 * implementa en TS con service role (misma semántica: dedupe por cliente,
 * razones de exclusión, estimado). `campaign_contacts.state` solo admite
 * sent|opened|clicked|replied|bounced → pending/skipped van en
 * `metadata.state` con `state = NULL` (idempotente: se borran y recrean los
 * no enviados).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { canContact } from './consent';
import { countryFromPhone, normalizePhoneDigits, resolveChannel } from './channelService';
import { estimateMessageCost } from './costs';
import { patchCampaignStats, requireCampaign } from './campaignStore';
import { getHsm } from './templateService';
import { WINDOW_MS } from './windowService';
import { WhatsAppError, type Campaign, type CampaignAudience, type HsmCategory } from './types';

export interface Candidate {
  customer_id: string;
  opportunity_id: string | null;
}

export type SkipReason = 'no_phone' | 'no_email' | 'opted_out' | 'us_marketing' | 'window_required' | 'duplicate_recent' | 'invalid_number';

export interface MaterializeResult {
  total: number;
  pending: number;
  skipped: number;
  skipped_by_reason: Record<string, number>;
  estimated_cost: number | null;
}

/** Reglas puras de exclusión (testeables). */
export function classifyCandidate(p: {
  channel: 'whatsapp' | 'email';
  phone: string | null | undefined;
  email: string | null | undefined;
  canContact: boolean;
  category: HsmCategory | null;
  hasTemplate: boolean;
  windowOpen: boolean;
  duplicateRecent: boolean;
  channelIsQr: boolean;
}): { recipient: string | null; reason: SkipReason | null } {
  if (p.channel === 'email') {
    const email = (p.email ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { recipient: null, reason: 'no_email' };
    if (!p.canContact) return { recipient: email, reason: 'opted_out' };
    if (p.duplicateRecent) return { recipient: email, reason: 'duplicate_recent' };
    return { recipient: email, reason: null };
  }
  const digits = p.phone ? normalizePhoneDigits(p.phone) : null;
  if (!digits) return { recipient: null, reason: p.phone ? 'invalid_number' : 'no_phone' };
  if (!p.canContact) return { recipient: digits, reason: 'opted_out' };
  if (p.category === 'marketing' && countryFromPhone(digits) === 'us') return { recipient: digits, reason: 'us_marketing' };
  if (!p.hasTemplate && !p.channelIsQr && !p.windowOpen) return { recipient: digits, reason: 'window_required' };
  if (p.duplicateRecent) return { recipient: digits, reason: 'duplicate_recent' };
  return { recipient: digits, reason: null };
}

// ─── Segmentos: misma semántica que SegmentosService.applyFilter ─────────────

const SEGMENT_FIELDS = new Set(['lifecycle_stage', 'tags', 'city', 'customer_type', 'created_at', 'health_score', 'vertical_id', 'company_size', 'country', 'source', 'email', 'phone', 'full_name', 'segment', 'status', 'lead_status', 'assigned_to']);

interface FilterRule { field: string; operator: string; value: unknown }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySegmentRule(query: any, rule: FilterRule): any {
  const { field, operator, value } = rule;
  if (!SEGMENT_FIELDS.has(field)) return query;
  switch (operator) {
    case 'equals': return query.eq(field, value);
    case 'not_equals': return query.neq(field, value);
    case 'contains': return field === 'tags' ? query.contains(field, [value]) : query.ilike(field, `%${value}%`);
    case 'not_contains': return query.not(field, 'ilike', `%${value}%`);
    case 'starts_with': return query.ilike(field, `${value}%`);
    case 'ends_with': return query.ilike(field, `%${value}`);
    case 'greater_than': return query.gt(field, value);
    case 'less_than': return query.lt(field, value);
    case 'in': return Array.isArray(value) ? query.in(field, value) : query;
    case 'not_in': return Array.isArray(value) ? query.not(field, 'in', `(${value.map((v) => `"${String(v)}"`).join(',')})`) : query;
    case 'between': return Array.isArray(value) && value.length === 2 ? query.gte(field, value[0]).lte(field, value[1]) : query;
    case 'is_empty': return query.is(field, null);
    case 'is_not_empty': return query.not(field, 'is', null);
    default: return query;
  }
}

export async function resolveAudience(orgId: number, audience: CampaignAudience, service: SupabaseClient, limit = 20000): Promise<Candidate[]> {
  const out = new Map<string, Candidate>();
  const add = (customerId: string, oppId: string | null) => {
    if (!customerId) return;
    const cur = out.get(customerId);
    if (!cur) out.set(customerId, { customer_id: customerId, opportunity_id: oppId });
    else if (!cur.opportunity_id && oppId) cur.opportunity_id = oppId;
  };
  if (audience.source === 'segment' && audience.segment_id) {
    const { data: seg } = await service.from('segments').select('id, filter_json').eq('id', audience.segment_id).eq('organization_id', orgId).maybeSingle();
    if (!seg) throw new WhatsAppError('NOT_FOUND', 'Segmento no encontrado', 404);
    let q = service.from('customers').select('id').eq('organization_id', orgId);
    const rules = ((seg as { filter_json?: unknown }).filter_json ?? []) as FilterRule[];
    if (Array.isArray(rules)) for (const r of rules) q = applySegmentRule(q, r);
    const { data, error } = await q.limit(limit);
    if (error) throw new WhatsAppError('INTERNAL', `Segmento: ${error.message}`, 500);
    for (const r of (data ?? []) as Array<{ id: string }>) add(r.id, null);
  } else if (audience.source === 'stage') {
    let q = service.from('opportunities').select('id, customer_id').eq('organization_id', orgId).eq('status', 'open').in('stage_id', audience.stage_ids ?? []);
    if (audience.pipeline_id) q = q.eq('pipeline_id', audience.pipeline_id);
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(limit);
    if (error) throw new WhatsAppError('INTERNAL', `Etapas: ${error.message}`, 500);
    for (const r of (data ?? []) as Array<{ id: string; customer_id: string | null }>) if (r.customer_id) add(r.customer_id, r.id);
  } else if (audience.source === 'manual') {
    if (audience.opportunity_ids?.length) {
      const { data } = await service.from('opportunities').select('id, customer_id').eq('organization_id', orgId).in('id', audience.opportunity_ids.slice(0, limit));
      for (const r of (data ?? []) as Array<{ id: string; customer_id: string | null }>) if (r.customer_id) add(r.customer_id, r.id);
    }
    if (audience.customer_ids?.length) {
      const { data } = await service.from('customers').select('id').eq('organization_id', orgId).in('id', audience.customer_ids.slice(0, limit));
      for (const r of (data ?? []) as Array<{ id: string }>) add(r.id, null);
    }
  }
  return Array.from(out.values());
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Clientes con ventana abierta (por canal) dentro del conjunto. */
async function openWindowSet(orgId: number, channelId: string | null, customerIds: string[], service: SupabaseClient, now: Date): Promise<Set<string>> {
  const set = new Set<string>();
  if (!channelId) return set;
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  for (const ids of chunk(customerIds, 500)) {
    const { data } = await service.from('conversations').select('customer_id').eq('organization_id', orgId).eq('channel_id', channelId).in('customer_id', ids).gt('last_inbound_at', since);
    for (const r of (data ?? []) as Array<{ customer_id: string }>) set.add(r.customer_id);
  }
  return set;
}

/** Clientes que recibieron la MISMA plantilla en otra campaña en los últimos 7 días. */
async function duplicateSet(orgId: number, campaignId: string, templateId: string | null, customerIds: string[], service: SupabaseClient, now: Date): Promise<Set<string>> {
  const set = new Set<string>();
  if (!templateId) return set;
  const { data: others } = await service.from('campaigns').select('id').eq('organization_id', orgId).eq('template_id', templateId).neq('id', campaignId);
  const otherIds = ((others ?? []) as Array<{ id: string }>).map((o) => o.id);
  if (!otherIds.length) return set;
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  for (const ids of chunk(customerIds, 500)) {
    const { data } = await service.from('campaign_contacts').select('customer_id').in('campaign_id', otherIds).in('customer_id', ids).gt('sent_at', since);
    for (const r of (data ?? []) as Array<{ customer_id: string }>) set.add(r.customer_id);
  }
  return set;
}

export async function materializeCampaign(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), now: Date = new Date()): Promise<MaterializeResult> {
  const c: Campaign = await requireCampaign(orgId, id, supabase);
  if (!['draft', 'scheduled'].includes(c.effective_status)) throw new WhatsAppError('NOT_EDITABLE', 'Solo se materializan campañas en borrador o programadas', 409);
  const audience = c.statistics.audience;
  if (!audience) throw new WhatsAppError('VALIDATION', 'La campaña no tiene audiencia definida', 400);
  const channel = c.channel ?? 'whatsapp';
  await patchCampaignStats(id, { state: 'materializing' }, service);
  try {
    const template = c.template_id ? await getHsm(orgId, c.template_id, service) : null;
    const category: HsmCategory | null = template?.meta.category ?? null;
    const purpose = category === 'marketing' || c.statistics.purpose === 'marketing' ? 'marketing' : 'utility';
    let channelId = c.statistics.channel_id ?? null;
    let provider: 'meta' | 'twilio' | 'baileys' = 'meta';
    if (channel === 'whatsapp') {
      const ch = await resolveChannel(orgId, channelId, service, service);
      channelId = ch.id;
      provider = ch.provider;
    }

    const candidates = await resolveAudience(orgId, audience, service);
    // Limpia lo no enviado (idempotente)
    const { data: existing } = await service.from('campaign_contacts').select('id, customer_id, state, metadata').eq('campaign_id', id);
    const keep = new Set<string>();
    const toDelete: string[] = [];
    for (const r of (existing ?? []) as Array<{ id: string; customer_id: string; state: string | null; metadata: Record<string, unknown> | null }>) {
      const st = r.state ?? (r.metadata?.state as string | undefined) ?? 'pending';
      if (['pending', 'queued', 'skipped'].includes(st)) toDelete.push(r.id);
      else keep.add(r.customer_id);
    }
    for (const ids of chunk(toDelete, 500)) await service.from('campaign_contacts').delete().in('id', ids);

    const fresh = candidates.filter((x) => !keep.has(x.customer_id));
    const ids = fresh.map((x) => x.customer_id);
    const customers = new Map<string, { phone: string | null; email: string | null }>();
    for (const part of chunk(ids, 500)) {
      const { data } = await service.from('customers').select('id, phone, email').eq('organization_id', orgId).in('id', part);
      for (const r of (data ?? []) as Array<{ id: string; phone: string | null; email: string | null }>) customers.set(r.id, { phone: r.phone, email: r.email });
    }
    const windows = channel === 'whatsapp' && !c.template_id ? await openWindowSet(orgId, channelId, ids, service, now) : new Set<string>();
    const dups = await duplicateSet(orgId, id, c.template_id, ids, service, now);

    const rows: Record<string, unknown>[] = [];
    const byReason: Record<string, number> = {};
    let pending = 0;
    for (const cand of fresh) {
      const cu = customers.get(cand.customer_id);
      if (!cu) continue;
      const ok = await canContact(orgId, cand.customer_id, channel, purpose, service);
      const cls = classifyCandidate({
        channel,
        phone: cu.phone,
        email: cu.email,
        canContact: ok,
        category,
        hasTemplate: !!c.template_id,
        windowOpen: windows.has(cand.customer_id),
        duplicateRecent: dups.has(cand.customer_id),
        channelIsQr: provider === 'baileys',
      });
      if (cls.reason) byReason[cls.reason] = (byReason[cls.reason] ?? 0) + 1;
      else pending += 1;
      rows.push({
        campaign_id: id,
        customer_id: cand.customer_id,
        state: null,
        metadata: {
          state: cls.reason ? 'skipped' : 'pending',
          skipped_reason: cls.reason,
          opportunity_id: cand.opportunity_id,
          recipient: cls.recipient,
          attempts: 0,
          batch_no: null,
          variables: {},
          organization_id: orgId,
        },
      });
    }
    for (const part of chunk(rows, 500)) {
      const { error } = await service.from('campaign_contacts').upsert(part, { onConflict: 'campaign_id,customer_id', ignoreDuplicates: true });
      if (error) throw new WhatsAppError('INTERNAL', `campaign_contacts: ${error.message}`, 500);
    }

    const skipped = Object.values(byReason).reduce((a, b) => a + b, 0);
    let estimated: number | null = null;
    if (channel === 'whatsapp') {
      const cost = await estimateMessageCost({ provider, category, recipient: '57', windowOpen: false, isTemplate: !!c.template_id });
      estimated = cost.unit_cost_usd === null ? null : Number((cost.unit_cost_usd * pending).toFixed(4));
    }
    const total = keep.size + rows.length;
    await patchCampaignStats(id, {
      state: null,
      channel_id: channelId,
      total_contacts: total,
      pending,
      skipped,
      exclusions: byReason,
      estimated_cost: estimated,
      materialized_at: now.toISOString(),
      purpose,
    }, service);
    return { total, pending, skipped, skipped_by_reason: byReason, estimated_cost: estimated };
  } catch (err) {
    await patchCampaignStats(id, { state: null }, service).catch(() => undefined);
    throw err;
  }
}
