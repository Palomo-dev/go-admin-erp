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
import { leerAudienciaSegmento, obtenerSegmento } from '../segmentosAudiencia';
import { CrmHttpError } from '../crmErrors';
import { getServiceClient } from '@/lib/supabase/server-service';
import { canContact } from './consent';
import {
  countryFromPhone,
  defaultCountryOf,
  getOrgSettings,
  normalizePhoneDigits,
  resolveChannel,
} from './channelService';
import { estimateMessageCost } from './costs';
import { patchCampaignStats, requireCampaign } from './campaignStore';
import { getHsm } from './templateService';
import { WINDOW_MS } from './windowService';
import { WhatsAppError, type Campaign, type CampaignAudience, type HsmCategory } from './types';

export interface Candidate {
  customer_id: string;
  opportunity_id: string | null;
}

export type SkipReason =
  'no_phone' | 'no_email' | 'opted_out' | 'us_marketing' | 'window_required' | 'duplicate_recent' | 'invalid_number';

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
  /** Indicativo con el que se completan los teléfonos nacionales de la org. */
  defaultCountry?: string | null;
}): { recipient: string | null; reason: SkipReason | null } {
  if (p.channel === 'email') {
    const email = (p.email ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { recipient: null, reason: 'no_email' };
    if (!p.canContact) return { recipient: email, reason: 'opted_out' };
    if (p.duplicateRecent) return { recipient: email, reason: 'duplicate_recent' };
    return { recipient: email, reason: null };
  }
  const digits = p.phone ? normalizePhoneDigits(p.phone, p.defaultCountry ?? null) : null;
  if (!digits) return { recipient: null, reason: p.phone ? 'invalid_number' : 'no_phone' };
  if (!p.canContact) return { recipient: digits, reason: 'opted_out' };
  if (p.category === 'marketing' && countryFromPhone(digits) === 'us')
    return { recipient: digits, reason: 'us_marketing' };
  if (!p.hasTemplate && !p.channelIsQr && !p.windowOpen) return { recipient: digits, reason: 'window_required' };
  if (p.duplicateRecent) return { recipient: digits, reason: 'duplicate_recent' };
  return { recipient: digits, reason: null };
}

export async function resolveAudience(
  orgId: number,
  audience: CampaignAudience,
  service: SupabaseClient,
  limit = 20000,
): Promise<Candidate[]> {
  const out = new Map<string, Candidate>();
  const add = (customerId: string, oppId: string | null) => {
    if (!customerId) return;
    const cur = out.get(customerId);
    if (!cur) out.set(customerId, { customer_id: customerId, opportunity_id: oppId });
    else if (!cur.opportunity_id && oppId) cur.opportunity_id = oppId;
  };
  if (audience.source === 'segment' && audience.segment_id) {
    try {
      const segment = await obtenerSegmento(orgId, audience.segment_id, service);
      const result = await leerAudienciaSegmento(orgId, service, {
        segment,
        collectIds: true,
        maxIds: limit,
      });
      for (const id of result.ids) add(id, null);
    } catch (error) {
      if (error instanceof CrmHttpError)
        throw new WhatsAppError(error.status === 404 ? 'NOT_FOUND' : 'VALIDATION', error.message, error.status);
      throw error;
    }
  } else if (audience.source === 'stage') {
    for (let from = 0; ; from += 500) {
      let q = service
        .from('opportunities')
        .select('id, customer_id')
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .in('stage_id', audience.stage_ids ?? []);
      if (audience.pipeline_id) q = q.eq('pipeline_id', audience.pipeline_id);
      const { data, error } = await q
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, from + 499);
      if (error) throw error;
      for (const r of (data ?? []) as Array<{
        id: string;
        customer_id: string | null;
      }>)
        if (r.customer_id) add(r.customer_id, r.id);
      if (out.size > limit) throw new WhatsAppError('VALIDATION', 'Reduce el tamaño de la audiencia', 413);
      if (!data || data.length < 500) break;
    }
  } else if (audience.source === 'manual') {
    for (const part of chunk([...new Set(audience.opportunity_ids ?? [])], 500)) {
      const { data, error } = await service
        .from('opportunities')
        .select('id, customer_id')
        .eq('organization_id', orgId)
        .in('id', part);
      if (error) throw error;
      if (data?.length !== part.length) throw new WhatsAppError('NOT_FOUND', 'Oportunidad no encontrada', 404);
      for (const r of data as Array<{ id: string; customer_id: string | null }>)
        if (r.customer_id) add(r.customer_id, r.id);
    }
    for (const part of chunk([...new Set(audience.customer_ids ?? [])], 500)) {
      const { data, error } = await service
        .from('customers')
        .select('id')
        .eq('organization_id', orgId)
        .neq('status', 'merged')
        .in('id', part);
      if (error) throw error;
      if (data?.length !== part.length) throw new WhatsAppError('NOT_FOUND', 'Cliente no encontrado', 404);
      for (const r of data as Array<{ id: string }>) add(r.id, null);
    }
    if (out.size > limit) throw new WhatsAppError('VALIDATION', 'Reduce el tamaño de la audiencia', 413);
  }
  return Array.from(out.values());
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Clientes con ventana abierta (por canal) dentro del conjunto. */
async function openWindowSet(
  orgId: number,
  channelId: string | null,
  customerIds: string[],
  service: SupabaseClient,
  now: Date,
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!channelId) return set;
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  for (const ids of chunk(customerIds, 500)) {
    const { data } = await service
      .from('conversations')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('channel_id', channelId)
      .in('customer_id', ids)
      .gt('last_inbound_at', since);
    for (const r of (data ?? []) as Array<{ customer_id: string }>) set.add(r.customer_id);
  }
  return set;
}

/** Clientes que recibieron la MISMA plantilla en otra campaña en los últimos 7 días. */
async function duplicateSet(
  orgId: number,
  campaignId: string,
  templateId: string | null,
  customerIds: string[],
  service: SupabaseClient,
  now: Date,
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!templateId) return set;
  const { data: others } = await service
    .from('campaigns')
    .select('id')
    .eq('organization_id', orgId)
    .eq('template_id', templateId)
    .neq('id', campaignId);
  const otherIds = ((others ?? []) as Array<{ id: string }>).map((o) => o.id);
  if (!otherIds.length) return set;
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  for (const ids of chunk(customerIds, 500)) {
    const { data } = await service
      .from('campaign_contacts')
      .select('customer_id')
      .in('campaign_id', otherIds)
      .in('customer_id', ids)
      .gt('sent_at', since);
    for (const r of (data ?? []) as Array<{ customer_id: string }>) set.add(r.customer_id);
  }
  return set;
}

/**
 * Coste estimado de la campaña (USD) a partir de la tarifa del país por
 * defecto de la organización. Antes el país era `'57'` cableado —el último
 * «57» de la fase— y una organización mexicana veía el precio colombiano.
 * Sigue siendo una estimación: el precio real lo fija Meta por destinatario.
 */
export async function estimateCampaignCost(p: {
  provider: 'meta' | 'twilio' | 'baileys';
  category: HsmCategory | null;
  isTemplate: boolean;
  pending: number;
  defaultCountry: string;
}): Promise<number | null> {
  const cost = await estimateMessageCost({
    provider: p.provider,
    category: p.category,
    recipient: p.defaultCountry,
    windowOpen: false,
    isTemplate: p.isTemplate,
  });
  return cost.unit_cost_usd === null ? null : Number((cost.unit_cost_usd * p.pending).toFixed(4));
}

export async function materializeCampaign(
  orgId: number,
  id: string,
  supabase: SupabaseClient,
  service: SupabaseClient = getServiceClient(),
  now: Date = new Date(),
): Promise<MaterializeResult> {
  const c: Campaign = await requireCampaign(orgId, id, supabase);
  if (!['draft', 'scheduled'].includes(c.effective_status))
    throw new WhatsAppError('NOT_EDITABLE', 'Solo se materializan campañas en borrador o programadas', 409);
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
    const { data: existing } = await service
      .from('campaign_contacts')
      .select('id, customer_id, state, metadata')
      .eq('campaign_id', id);
    const keep = new Set<string>();
    const toDelete: string[] = [];
    for (const r of (existing ?? []) as Array<{
      id: string;
      customer_id: string;
      state: string | null;
      metadata: Record<string, unknown> | null;
    }>) {
      const st = r.state ?? (r.metadata?.state as string | undefined) ?? 'pending';
      if (['pending', 'queued', 'skipped'].includes(st)) toDelete.push(r.id);
      else keep.add(r.customer_id);
    }
    for (const ids of chunk(toDelete, 500)) await service.from('campaign_contacts').delete().in('id', ids);

    const fresh = candidates.filter((x) => !keep.has(x.customer_id));
    const ids = fresh.map((x) => x.customer_id);
    const customers = new Map<string, { phone: string | null; email: string | null }>();
    for (const part of chunk(ids, 500)) {
      const { data } = await service
        .from('customers')
        .select('id, phone, email')
        .eq('organization_id', orgId)
        .in('id', part);
      for (const r of (data ?? []) as Array<{
        id: string;
        phone: string | null;
        email: string | null;
      }>)
        customers.set(r.id, { phone: r.phone, email: r.email });
    }
    const windows =
      channel === 'whatsapp' && !c.template_id
        ? await openWindowSet(orgId, channelId, ids, service, now)
        : new Set<string>();
    const dups = await duplicateSet(orgId, id, c.template_id, ids, service, now);

    // Indicativo por defecto de la ORG (una sola lectura para todo el lote).
    const defaultCountry = defaultCountryOf(await getOrgSettings(orgId, service));
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
        defaultCountry,
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
      const { error } = await service.from('campaign_contacts').upsert(part, {
        onConflict: 'campaign_id,customer_id',
        ignoreDuplicates: true,
      });
      if (error) throw new WhatsAppError('INTERNAL', `campaign_contacts: ${error.message}`, 500);
    }

    const skipped = Object.values(byReason).reduce((a, b) => a + b, 0);
    const estimated =
      channel === 'whatsapp'
        ? await estimateCampaignCost({
            provider,
            category,
            isTemplate: !!c.template_id,
            pending,
            defaultCountry,
          })
        : null;
    const total = keep.size + rows.length;
    await patchCampaignStats(
      id,
      {
        state: null,
        channel_id: channelId,
        total_contacts: total,
        pending,
        skipped,
        exclusions: byReason,
        estimated_cost: estimated,
        materialized_at: now.toISOString(),
        purpose,
      },
      service,
    );
    return {
      total,
      pending,
      skipped,
      skipped_by_reason: byReason,
      estimated_cost: estimated,
    };
  } catch (err) {
    await patchCampaignStats(id, { state: null }, service).catch(() => undefined);
    throw err;
  }
}
