/**
 * CRUD de campañas v2 sobre el schema REAL de `campaigns` (FASE-16 §4.2
 * `campaignService`, parte de persistencia).
 *
 * Desviación documentada: las columnas nuevas del doc (channel_id, source_type,
 * source_config, throttle_mps, totales, costos, started/finished/paused/
 * canceled_at, next_batch_no) NO existen en BD → viven en
 * `campaigns.statistics` (`CampaignConfig`). `segment_id`/`template_id`/
 * `scheduled_at`/`content` sí son columnas reales y se usan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { errorWhatsAppDb } from './erroresDbLogica';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  WhatsAppError,
  effectiveCampaignStatus,
  type Campaign,
  type CampaignChannel,
  type CampaignConfig,
} from './types';

import { campaignCreateValues, campaignUpdateValues, type CreateCampaignInput, type UpdateCampaignInput } from './campaignStoreLogica';
export { validateAudience, sameAudience, clampThrottle } from './campaignStoreLogica';
export type { CreateCampaignInput, UpdateCampaignInput } from './campaignStoreLogica';

const COLS = 'id, organization_id, name, channel, status, scheduled_at, template_id, segment_id, content, statistics, created_by, created_at, updated_at';

export function rowToCampaign(r: Record<string, unknown>): Campaign {
  const stats = ((r.statistics as CampaignConfig | null) ?? {}) as CampaignConfig;
  return {
    id: String(r.id),
    organization_id: Number(r.organization_id),
    name: String(r.name),
    channel: (r.channel as CampaignChannel | null) ?? null,
    status: (r.status as Campaign['status']) ?? 'draft',
    scheduled_at: (r.scheduled_at as string | null) ?? null,
    template_id: (r.template_id as string | null) ?? null,
    segment_id: (r.segment_id as string | null) ?? null,
    content: (r.content as string | null) ?? null,
    statistics: stats,
    created_by: (r.created_by as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    effective_status: effectiveCampaignStatus(String(r.status ?? 'draft'), stats),
  };
}

/** Solo después de autorizar la sesión; la RPC valida y bloquea todas las referencias. */
async function mutateCampaign(
  fn: 'crm_campaign_save' | 'crm_campaign_archive',
  orgId: number,
  actor: string | null,
  id: string | null,
  version: string | null,
  values: Record<string, unknown> | null,
  service: SupabaseClient,
): Promise<Campaign> {
  if (!actor) throw new WhatsAppError('ADMIN_REQUIRED', 'Se requiere una sesión de usuario', 403);
  const args: Record<string, unknown> = { p_org: orgId, p_campaign: id, p_version: version, p_actor: actor };
  if (values) args.p_values = values;
  const { data, error } = await service.rpc(fn, args);
  if (error) throw errorWhatsAppDb(error);
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.organization_id !== orgId || (id && data.id !== id) || typeof data.id !== 'string') {
    throw new WhatsAppError('INTERNAL', 'Respuesta inválida al guardar la campaña', 500);
  }
  return rowToCampaign(data as Record<string, unknown>);
}

export async function listCampaigns(orgId: number, filters: { status?: string; channel?: string; q?: string; limit?: number }, supabase: SupabaseClient): Promise<Campaign[]> {
  let q = supabase.from('campaigns').select(COLS).eq('organization_id', orgId).is('statistics->>archived_at', null).order('created_at', { ascending: false }).limit(filters.limit ?? 200);
  if (filters.channel) q = q.eq('channel', filters.channel);
  if (filters.q) q = q.ilike('name', `%${filters.q.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  let list = ((data ?? []) as Record<string, unknown>[]).map(rowToCampaign);
  if (filters.status) list = list.filter((c) => c.effective_status === filters.status);
  return list;
}

export async function getCampaign(orgId: number, id: string, supabase: SupabaseClient): Promise<Campaign | null> {
  const { data, error } = await supabase.from('campaigns').select(COLS).eq('id', id).eq('organization_id', orgId).is('statistics->>archived_at', null).maybeSingle();
  if (error) throw errorWhatsAppDb(error);
  return data ? rowToCampaign(data as Record<string, unknown>) : null;
}

export async function requireCampaign(orgId: number, id: string, supabase: SupabaseClient): Promise<Campaign> {
  const c = await getCampaign(orgId, id, supabase);
  if (!c) throw new WhatsAppError('NOT_FOUND', 'Campaña no encontrada', 404);
  return c;
}

export async function createCampaign(orgId: number, userId: string | null, input: CreateCampaignInput, _supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<Campaign> {
  return mutateCampaign('crm_campaign_save', orgId, userId, null, null, campaignCreateValues(input), service);
}

export async function updateCampaign(orgId: number, id: string, input: UpdateCampaignInput, supabase: SupabaseClient, actor: string | null, service: SupabaseClient = getServiceClient()): Promise<Campaign> {
  const c = await requireCampaign(orgId, id, supabase);
  if (!['draft', 'scheduled'].includes(c.effective_status)) throw new WhatsAppError('NOT_EDITABLE', 'Solo se editan campañas en borrador o programadas', 409);
  return mutateCampaign('crm_campaign_save', orgId, actor, id, input.expected_updated_at ?? c.updated_at, campaignUpdateValues(c, input), service);
}

/** Archiva y cancela pendientes en una transacción; conserva contactos, RNE y ledger. */
export async function deleteCampaign(orgId: number, id: string, supabase: SupabaseClient, actor: string | null, service: SupabaseClient = getServiceClient()): Promise<void> {
  const c = await requireCampaign(orgId, id, supabase);
  await mutateCampaign('crm_campaign_archive', orgId, actor, id, c.updated_at, null, service);
}
