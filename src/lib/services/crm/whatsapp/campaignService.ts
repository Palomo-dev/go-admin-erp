/**
 * Ciclo de vida de campañas (FASE-16 §2.3-2.4, §4.2 `campaignService`):
 * launch (messaging_limit no bloqueante + créditos + job `campaign_batch`),
 * pause / resume / cancel, stats y contactos.
 *
 * Estados `paused|canceled|materializing` viven en `statistics.state`
 * (CHECK real de `campaigns.status` = draft|scheduled|sending|sent).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { getChannelCredentials, resolveChannel } from './channelService';
import { rowToCampaign, requireCampaign } from './campaignStore';
import { errorWhatsAppDb } from './erroresDbLogica';
import { getHsm } from './templateService';
import { metaMessagingLimit } from './templateProvider';
import { contactState, WhatsAppError, type Campaign, type CampaignContact, type CampaignContactMeta, type CampaignCounts } from './types';

export const CAMPAIGN_BATCH_SIZE = 50;

export function batchDedupeKey(campaignId: string, batchNo: number): string {
  return `campaign_batch:${campaignId}:${batchNo}`;
}

export async function enqueueBatch(orgId: number, campaignId: string, batchNo: number, runAt: Date | string, service: SupabaseClient): Promise<string> {
  return enqueueJob({
    organizationId: orgId,
    kind: 'campaign_batch',
    payload: { campaign_id: campaignId, batch_no: batchNo },
    runAt,
    dedupeKey: batchDedupeKey(campaignId, batchNo),
    maxAttempts: 50,
    supabase: service,
  });
}

/** GET /{WABA_ID}?fields=whatsapp_business_manager_messaging_limit — NO bloquea el lanzamiento. */
export async function checkMessagingLimit(orgId: number, channelId: string, pending: number, service: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<{ tier: string | null; limit: number | null; checked_at: string; warning?: string }> {
  const checked_at = new Date().toISOString();
  try {
    const creds = await getChannelCredentials(orgId, channelId, service);
    if (creds.provider !== 'meta') return { tier: null, limit: null, checked_at };
    const r = await metaMessagingLimit(creds, fetchImpl);
    const warning = r.limit !== null && pending > r.limit ? `La campaña (${pending}) supera el límite de ${r.limit} usuarios únicos/24 h del WABA (${r.tier}); Meta puede rechazar parte de los envíos (131048).` : undefined;
    return { tier: r.tier, limit: r.limit, checked_at, warning };
  } catch (err) {
    return { tier: null, limit: null, checked_at, warning: `No se pudo verificar el messaging_limit: ${err instanceof Error ? err.message : 'error'}` };
  }
}

async function transitionCampaign(
  orgId: number, c: Campaign, action: 'launch' | 'pause' | 'resume' | 'cancel', actor: string | null,
  options: Record<string, unknown>, service: SupabaseClient,
): Promise<Campaign> {
  const { data, error } = await service.rpc('crm_campaign_transition', {
    p_org: orgId, p_campaign: c.id, p_action: action, p_version: c.updated_at, p_actor: actor, p_options: options,
  });
  if (error) throw errorWhatsAppDb(error);
  if (!data || typeof data !== 'object') throw new WhatsAppError('INTERNAL', 'Transición sin resultado', 500);
  return rowToCampaign(data as Record<string, unknown>);
}

export async function readCampaignCounts(orgId: number, id: string, service: SupabaseClient): Promise<CampaignCounts> {
  const { data, error } = await service.rpc('crm_campaign_contact_counts', { p_org: orgId, p_campaign: id });
  if (error) throw errorWhatsAppDb(error);
  if (!data || typeof data !== 'object') throw new WhatsAppError('INTERNAL', 'Recuento sin resultado', 500);
  return data as CampaignCounts;
}

export async function launchCampaign(orgId: number, userId: string | null, id: string, opts: { scheduledAt?: string | null; force?: boolean }, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<Campaign> {
  const c = await requireCampaign(orgId, id, supabase);
  if (c.effective_status !== 'draft') throw new WhatsAppError('NOT_EDITABLE', `La campaña está en estado ${c.effective_status}`, 409);
  if (!c.statistics.materialized_at) throw new WhatsAppError('NOT_MATERIALIZED', 'Calcula la audiencia antes de lanzar', 409);
  const counts = await readCampaignCounts(orgId, id, service);
  if (counts.pending <= 0) throw new WhatsAppError('NOT_MATERIALIZED', 'La campaña no tiene contactos pendientes', 409);
  let messagingLimit: Campaign['statistics']['messaging_limit'] = null;
  if (c.channel === 'whatsapp') {
    const channel = await resolveChannel(orgId, c.statistics.channel_id ?? null, service, service);
    if (channel.status !== 'active') throw new WhatsAppError('NO_CHANNEL', `El canal "${channel.name}" no está activo`, 422);
    if (c.template_id) {
      const t = await getHsm(orgId, c.template_id, service);
      if (!t) throw new WhatsAppError('NOT_FOUND', 'Plantilla no encontrada', 404);
      if (t.meta.status !== 'APPROVED') throw new WhatsAppError('TEMPLATE_NOT_APPROVED', `La plantilla "${t.name}" no está aprobada (${t.meta.status})`, 409);
      if (!channel.capabilities.templates) throw new WhatsAppError('CHANNEL_NO_TEMPLATES', 'El canal QR no admite plantillas', 422);
    }
    // El límite externo es un aviso; la RPC decide saldo y audiencia actuales.
    messagingLimit = await checkMessagingLimit(orgId, channel.id, counts.pending, service);
  }
  return transitionCampaign(orgId, c, 'launch', userId, {
    ...(opts.scheduledAt !== undefined ? { scheduled_at: opts.scheduledAt } : {}), messaging_limit: messagingLimit,
  }, service);
}

export async function pauseCampaign(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), actor: string | null = null): Promise<Campaign> {
  return transitionCampaign(orgId, await requireCampaign(orgId, id, supabase), 'pause', actor, {}, service);
}

export async function resumeCampaign(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), actor: string | null = null): Promise<Campaign> {
  return transitionCampaign(orgId, await requireCampaign(orgId, id, supabase), 'resume', actor, {}, service);
}

export async function cancelCampaign(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), actor: string | null = null): Promise<Campaign> {
  return transitionCampaign(orgId, await requireCampaign(orgId, id, supabase), 'cancel', actor, {}, service);
}

/** pending|queued → skipped:reason (metadata). Devuelve cuántos. */
export async function skipPending(campaignId: string, reason: string, service: SupabaseClient): Promise<number> {
  const { data } = await service.from('campaign_contacts').select('id, metadata').eq('campaign_id', campaignId).is('state', null).limit(5000);
  let n = 0;
  for (const r of (data ?? []) as Array<{ id: string; metadata: CampaignContactMeta | null }>) {
    const st = r.metadata?.state ?? 'pending';
    if (st !== 'pending' && st !== 'queued') continue;
    await service.from('campaign_contacts').update({ metadata: { ...(r.metadata ?? {}), state: 'skipped', skipped_reason: reason }, updated_at: new Date().toISOString() }).eq('id', r.id);
    n += 1;
  }
  return n;
}

/** Conteos puros a partir de filas (testeable). */
export function countContacts(rows: Array<{ state: string | null; metadata: CampaignContactMeta | null; replied_at?: string | null }>): CampaignCounts {
  const c: CampaignCounts = { total: 0, pending: 0, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, skipped: 0, cost: 0 };
  for (const r of rows) {
    c.total += 1;
    const st = contactState(r);
    if (st === 'pending') c.pending += 1;
    else if (st === 'queued') c.queued += 1;
    else if (st === 'failed') c.failed += 1;
    else if (st === 'skipped') c.skipped += 1;
    else if (st === 'bounced') c.failed += 1;
    else {
      c.sent += 1;
      if (st === 'delivered' || st === 'read' || st === 'replied') c.delivered += 1;
      if (st === 'read' || st === 'replied') c.read += 1;
    }
    if (r.replied_at || st === 'replied') c.replied += 1;
    const cost = Number(r.metadata?.cost_amount ?? 0);
    if (Number.isFinite(cost)) c.cost += cost;
  }
  c.cost = Number(c.cost.toFixed(5));
  return c;
}

export async function computeCampaignCounts(campaignId: string, service: SupabaseClient): Promise<CampaignCounts> {
  const { data } = await service.from('campaign_contacts').select('state, metadata, replied_at').eq('campaign_id', campaignId).limit(20000);
  return countContacts((data ?? []) as Array<{ state: string | null; metadata: CampaignContactMeta | null; replied_at: string | null }>);
}

export interface CampaignStats {
  counts: CampaignCounts;
  by_error_code: Record<string, number>;
  by_skip_reason: Record<string, number>;
  timeline: Array<{ minute: string; sent: number; delivered: number; read: number; failed: number }>;
  estimated_cost: number | null;
  actual_cost: number;
}

export async function getCampaignStats(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<CampaignStats> {
  const c = await requireCampaign(orgId, id, supabase);
  const { data } = await service.from('campaign_contacts').select('state, metadata, replied_at, sent_at').eq('campaign_id', id).limit(20000);
  const rows = (data ?? []) as Array<{ state: string | null; metadata: CampaignContactMeta | null; replied_at: string | null; sent_at: string | null }>;
  const counts = countContacts(rows);
  const byErr: Record<string, number> = {};
  const bySkip: Record<string, number> = {};
  const tl = new Map<string, { sent: number; delivered: number; read: number; failed: number }>();
  const bucket = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) + ':00' : null);
  for (const r of rows) {
    const m = r.metadata ?? {};
    if (m.error_code) byErr[String(m.error_code)] = (byErr[String(m.error_code)] ?? 0) + 1;
    if (m.skipped_reason && contactState(r) === 'skipped') bySkip[String(m.skipped_reason)] = (bySkip[String(m.skipped_reason)] ?? 0) + 1;
    const get = (k: string | null) => { if (!k) return null; if (!tl.has(k)) tl.set(k, { sent: 0, delivered: 0, read: 0, failed: 0 }); return tl.get(k)!; };
    const s = get(bucket(r.sent_at)); if (s) s.sent += 1;
    const d = get(bucket(m.delivered_at)); if (d) d.delivered += 1;
    const rd = get(bucket(m.read_at)); if (rd) rd.read += 1;
    const f = get(bucket(m.failed_at)); if (f) f.failed += 1;
  }
  const timeline = Array.from(tl.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([minute, v]) => ({ minute, ...v }));
  return { counts, by_error_code: byErr, by_skip_reason: bySkip, timeline, estimated_cost: c.statistics.estimated_cost ?? null, actual_cost: counts.cost };
}

export async function listCampaignContacts(orgId: number, id: string, opts: { state?: string; q?: string; page?: number; pageSize?: number }, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<{ data: CampaignContact[]; total: number }> {
  await requireCampaign(orgId, id, supabase);
  const pageSize = Math.min(500, Math.max(1, opts.pageSize ?? 50));
  const page = Math.max(1, opts.page ?? 1);
  const { data } = await service
    .from('campaign_contacts')
    .select('id, campaign_id, customer_id, state, sent_at, opened_at, clicked_at, replied_at, bounced_at, metadata, created_at, updated_at, customer:customers(id, full_name, first_name, email, phone)')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })
    .limit(5000);
  let rows = ((data ?? []) as unknown as CampaignContact[]).map((r) => ({ ...r, customer: Array.isArray(r.customer) ? (r.customer[0] ?? null) : r.customer }));
  if (opts.state) rows = rows.filter((r) => contactState(r) === opts.state);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((r) => `${r.customer?.full_name ?? ''} ${r.customer?.phone ?? ''} ${r.customer?.email ?? ''}`.toLowerCase().includes(q));
  }
  const total = rows.length;
  return { data: rows.slice((page - 1) * pageSize, page * pageSize), total };
}

export function contactsToCsv(rows: CampaignContact[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['cliente', 'telefono', 'email', 'estado', 'razon', 'error', 'enviado', 'entregado', 'leido', 'respondio'];
  const lines = rows.map((r) => [r.customer?.full_name ?? '', r.customer?.phone ?? '', r.customer?.email ?? '', contactState(r), r.metadata?.skipped_reason ?? '', r.metadata?.error_code ?? '', r.sent_at ?? '', r.metadata?.delivered_at ?? '', r.metadata?.read_at ?? '', r.replied_at ?? ''].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}
