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
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  WhatsAppError,
  effectiveCampaignStatus,
  type AudienceSource,
  type Campaign,
  type CampaignAudience,
  type CampaignChannel,
  type CampaignConfig,
} from './types';

const COLS = 'id, organization_id, name, channel, status, scheduled_at, template_id, segment_id, content, statistics, created_by, created_at, updated_at';

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  channel_id?: string | null;
  template_id?: string | null;
  content?: string | null;
  audience: CampaignAudience;
  scheduled_at?: string | null;
  throttle_mps?: number;
  respect_allowed_hours?: boolean;
  default_variables?: Record<string, unknown>;
  purpose?: 'utility' | 'marketing';
  description?: string | null;
}
export type UpdateCampaignInput = Partial<CreateCampaignInput>;

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

const AUDIENCE_SOURCES: AudienceSource[] = ['segment', 'stage', 'manual'];

export function validateAudience(a: CampaignAudience | undefined): CampaignAudience {
  if (!a || !a.source) throw new WhatsAppError('VALIDATION', 'audience.source es requerido (segment | stage | manual)', 400);
  // Sin esta comprobación un `source` desconocido pasaba la validación y la
  // campaña se materializaba con 0 contactos en silencio.
  if (!AUDIENCE_SOURCES.includes(a.source)) {
    throw new WhatsAppError('VALIDATION', `audience.source inválido: "${a.source}" (segment | stage | manual)`, 400);
  }
  if (a.source === 'segment' && !a.segment_id) throw new WhatsAppError('VALIDATION', 'audience.segment_id es requerido', 400);
  if (a.source === 'stage' && !(a.stage_ids?.length)) throw new WhatsAppError('VALIDATION', 'audience.stage_ids es requerido', 400);
  if (a.source === 'manual' && !(a.opportunity_ids?.length || a.customer_ids?.length)) {
    throw new WhatsAppError('VALIDATION', 'audience.opportunity_ids o customer_ids es requerido', 400);
  }
  return {
    source: a.source,
    segment_id: a.segment_id ?? null,
    pipeline_id: a.pipeline_id ?? null,
    stage_ids: a.stage_ids ?? [],
    opportunity_ids: a.opportunity_ids ?? [],
    customer_ids: a.customer_ids ?? [],
  };
}

/**
 * Igualdad de audiencias (orden de los ids irrelevante). Se usa para NO
 * invalidar la materialización cuando el PATCH reenvía la misma audiencia.
 */
export function sameAudience(a: CampaignAudience | undefined | null, b: CampaignAudience | undefined | null): boolean {
  if (!a || !b) return !a && !b;
  const list = (x?: string[] | null) => [...(x ?? [])].map(String).sort().join('|');
  return (
    a.source === b.source &&
    (a.segment_id ?? null) === (b.segment_id ?? null) &&
    (a.pipeline_id ?? null) === (b.pipeline_id ?? null) &&
    list(a.stage_ids) === list(b.stage_ids) &&
    list(a.opportunity_ids) === list(b.opportunity_ids) &&
    list(a.customer_ids) === list(b.customer_ids)
  );
}

export function clampThrottle(v: unknown, fallback = 10): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(80, Math.max(1, Math.round(n)));
}

async function assertOwnership(orgId: number, input: Partial<CreateCampaignInput>, supabase: SupabaseClient): Promise<void> {
  if (input.template_id) {
    const { data } = await supabase.from('templates').select('id, channel').eq('id', input.template_id).eq('organization_id', orgId).maybeSingle();
    if (!data) throw new WhatsAppError('NOT_FOUND', 'Plantilla no encontrada en la organización', 404);
  }
  if (input.channel_id) {
    const { data } = await supabase.from('channels').select('id').eq('id', input.channel_id).eq('organization_id', orgId).maybeSingle();
    if (!data) throw new WhatsAppError('NOT_FOUND', 'Canal no encontrado en la organización', 404);
  }
  if (input.audience?.source === 'segment' && input.audience.segment_id) {
    const { data } = await supabase.from('segments').select('id').eq('id', input.audience.segment_id).eq('organization_id', orgId).maybeSingle();
    if (!data) throw new WhatsAppError('NOT_FOUND', 'Segmento no encontrado en la organización', 404);
  }
}

export async function listCampaigns(orgId: number, filters: { status?: string; channel?: string; q?: string; limit?: number }, supabase: SupabaseClient): Promise<Campaign[]> {
  let q = supabase.from('campaigns').select(COLS).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(filters.limit ?? 200);
  if (filters.channel) q = q.eq('channel', filters.channel);
  if (filters.q) q = q.ilike('name', `%${filters.q.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  let list = ((data ?? []) as Record<string, unknown>[]).map(rowToCampaign);
  if (filters.status) list = list.filter((c) => c.effective_status === filters.status);
  return list;
}

export async function getCampaign(orgId: number, id: string, supabase: SupabaseClient): Promise<Campaign | null> {
  const { data } = await supabase.from('campaigns').select(COLS).eq('id', id).eq('organization_id', orgId).maybeSingle();
  return data ? rowToCampaign(data as Record<string, unknown>) : null;
}

export async function requireCampaign(orgId: number, id: string, supabase: SupabaseClient): Promise<Campaign> {
  const c = await getCampaign(orgId, id, supabase);
  if (!c) throw new WhatsAppError('NOT_FOUND', 'Campaña no encontrada', 404);
  return c;
}

export async function createCampaign(orgId: number, userId: string | null, input: CreateCampaignInput, supabase: SupabaseClient): Promise<Campaign> {
  const name = (input.name ?? '').trim();
  if (!name) throw new WhatsAppError('VALIDATION', 'El nombre es requerido', 400);
  if (input.channel !== 'whatsapp' && input.channel !== 'email') throw new WhatsAppError('VALIDATION', 'channel debe ser whatsapp | email', 400);
  const audience = validateAudience(input.audience);
  if (!input.template_id && !input.content?.trim()) throw new WhatsAppError('VALIDATION', 'Se requiere template_id o content', 400);
  await assertOwnership(orgId, input, supabase);
  const stats: CampaignConfig = {
    audience,
    channel_id: input.channel_id ?? null,
    throttle_mps: clampThrottle(input.throttle_mps),
    respect_allowed_hours: input.respect_allowed_hours !== false,
    default_variables: input.default_variables ?? {},
    purpose: input.purpose ?? 'utility',
    description: input.description ?? null,
    state: null,
    next_batch_no: 1,
    total_contacts: 0,
    pending: 0,
    skipped: 0,
    exclusions: {},
    estimated_cost: null,
    actual_cost: 0,
    error_summary: {},
  };
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      organization_id: orgId,
      name,
      channel: input.channel,
      status: 'draft',
      scheduled_at: input.scheduled_at ?? null,
      template_id: input.template_id ?? null,
      segment_id: audience.source === 'segment' ? audience.segment_id : null,
      content: input.content ?? null,
      statistics: stats,
      created_by: userId,
    })
    .select(COLS)
    .single();
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return rowToCampaign(data as Record<string, unknown>);
}

export async function updateCampaign(orgId: number, id: string, input: UpdateCampaignInput, supabase: SupabaseClient): Promise<Campaign> {
  const c = await requireCampaign(orgId, id, supabase);
  if (!['draft', 'scheduled'].includes(c.effective_status)) throw new WhatsAppError('NOT_EDITABLE', 'Solo se editan campañas en borrador o programadas', 409);
  await assertOwnership(orgId, input, supabase);
  const audience = input.audience ? validateAudience(input.audience) : c.statistics.audience;
  const stats: CampaignConfig = {
    ...c.statistics,
    audience,
    channel_id: input.channel_id === undefined ? c.statistics.channel_id : input.channel_id,
    throttle_mps: input.throttle_mps === undefined ? c.statistics.throttle_mps : clampThrottle(input.throttle_mps),
    respect_allowed_hours: input.respect_allowed_hours === undefined ? c.statistics.respect_allowed_hours : input.respect_allowed_hours,
    default_variables: input.default_variables ?? c.statistics.default_variables,
    purpose: input.purpose ?? c.statistics.purpose,
    description: input.description === undefined ? c.statistics.description : input.description,
  };
  // Cambiar audiencia/plantilla invalida la materialización previa.
  // Solo si CAMBIA de verdad (tester r1 · fallo 3): el compositor masivo del
  // Kanban reenvía siempre el mismo `audience`+`template_id` al pulsar
  // "Enviar", así que invalidar por la mera presencia del campo borraba el
  // cálculo hecho con "Calcular" y `launch` respondía 409 NOT_MATERIALIZED en
  // bucle.
  const audienceChanged = !!input.audience && !sameAudience(c.statistics.audience, audience);
  const templateChanged = input.template_id !== undefined && (input.template_id ?? null) !== (c.template_id ?? null);
  // `purpose` cambia las exclusiones (marketing exige consentimiento).
  const purposeChanged = input.purpose !== undefined && input.purpose !== c.statistics.purpose;
  if (audienceChanged || templateChanged || purposeChanged) stats.materialized_at = null;
  const patch: Record<string, unknown> = { statistics: stats, updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.template_id !== undefined) patch.template_id = input.template_id;
  if (input.content !== undefined) patch.content = input.content;
  if (input.scheduled_at !== undefined) patch.scheduled_at = input.scheduled_at;
  if (input.audience) patch.segment_id = audience?.source === 'segment' ? audience.segment_id : null;
  const { data, error } = await supabase.from('campaigns').update(patch).eq('id', id).eq('organization_id', orgId).select(COLS).single();
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return rowToCampaign(data as Record<string, unknown>);
}

export async function deleteCampaign(orgId: number, id: string, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<void> {
  const c = await requireCampaign(orgId, id, supabase);
  if (c.effective_status === 'sending') throw new WhatsAppError('NOT_EDITABLE', 'Pausa o cancela la campaña antes de eliminarla', 409);
  await service.from('campaign_contacts').delete().eq('campaign_id', id);
  const { error } = await supabase.from('campaigns').delete().eq('id', id).eq('organization_id', orgId);
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
}

/** Merge parcial de `statistics` (service role; el caller ya validó la org). */
export async function patchCampaignStats(id: string, patch: Partial<CampaignConfig>, service: SupabaseClient, extra: Record<string, unknown> = {}): Promise<Campaign> {
  const { data: cur } = await service.from('campaigns').select('statistics').eq('id', id).maybeSingle();
  const stats = { ...(((cur as { statistics?: CampaignConfig } | null)?.statistics) ?? {}), ...patch };
  const { data, error } = await service.from('campaigns').update({ statistics: stats, updated_at: new Date().toISOString(), ...extra }).eq('id', id).select(COLS).single();
  if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  return rowToCampaign(data as Record<string, unknown>);
}
