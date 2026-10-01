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
import { filasACsv } from '@/lib/utils/csv';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
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

export interface CampaignStats {
  counts: CampaignCounts;
  by_error_code: Record<string, number>;
  by_skip_reason: Record<string, number>;
  timeline: Array<{ minute: string; sent: number; delivered: number; read: number; failed: number }>;
  estimated_cost: number | null;
  actual_cost: number | null;
  known_actual_cost: number;
  actual_cost_complete: boolean;
  unpriced_contacts: number;
}

export async function getCampaignStats(orgId: number, id: string, supabase: SupabaseClient): Promise<CampaignStats> {
  const { data, error } = await supabase.rpc('crm_campaign_contact_stats', { p_org: orgId, p_campaign: id });
  if (error) throw errorWhatsAppDb(error);
  if (!data || typeof data !== 'object' || !data.counts || !Array.isArray(data.timeline)
    || typeof data.actual_cost_complete !== 'boolean' || typeof data.known_actual_cost !== 'number')
    throw new WhatsAppError('INTERNAL', 'Cifras sin resultado válido', 500);
  return data as CampaignStats;
}

type ContactsFilter = { state?: string; q?: string };
type ContactsResult = { data: CampaignContact[]; total: number };

function contactsResult(data: unknown): ContactsResult {
  if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data)
    || !('total' in data) || !Number.isSafeInteger(data.total) || Number(data.total) < data.data.length)
    throw new WhatsAppError('INTERNAL', 'Contactos sin resultado válido', 500);
  return data as ContactsResult;
}

export async function listCampaignContacts(orgId: number, id: string, opts: ContactsFilter & { page?: number; pageSize?: number }, supabase: SupabaseClient): Promise<ContactsResult> {
  const { data, error } = await supabase.rpc('crm_campaign_contacts_page', {
    p_org: orgId, p_campaign: id, p_state: opts.state ?? null, p_q: opts.q ?? null,
    p_page: opts.page ?? 1, p_size: opts.pageSize ?? 50,
  });
  if (error) throw errorWhatsAppDb(error);
  return contactsResult(data);
}

/** La exportación se obtiene completa en una lectura, sin páginas mutables. */
export async function exportCampaignContacts(orgId: number, id: string, opts: ContactsFilter, supabase: SupabaseClient): Promise<ContactsResult> {
  const { data, error } = await supabase.rpc('crm_campaign_contacts_export', {
    p_org: orgId, p_campaign: id, p_state: opts.state ?? null, p_q: opts.q ?? null,
  });
  if (error) throw errorWhatsAppDb(error);
  const result = contactsResult(data);
  if (result.data.length !== result.total) throw new WhatsAppError('INTERNAL', 'Exportación incompleta', 500);
  return result;
}

export function contactsToCsv(rows: CampaignContact[], timezone: string): string {
  const fecha = (value: string | null | undefined) => formatDateInTz(value, timezone, { dateStyle: 'short', timeStyle: 'medium' });
  const head = ['cliente', 'telefono', 'email', 'estado', 'razon', 'error', 'enviado', 'entregado', 'leido', 'respondio'];
  return filasACsv(head, rows.map((r) => [
    r.customer?.full_name ?? '', r.customer?.phone ?? '', r.customer?.email ?? '', contactState(r),
    r.metadata?.skipped_reason ?? '', r.metadata?.error_code ?? '', fecha(r.sent_at),
    fecha(r.metadata?.delivered_at), fecha(r.metadata?.read_at), fecha(r.replied_at),
  ]));
}
