/**
 * CampanasService (FASE-16): fachada del cliente sobre `/api/crm/campaigns/*`.
 * Ya no escribe `campaigns.status` directamente (antes "Enviar" era un UPDATE);
 * lecturas auxiliares (segmentos, pipelines/etapas) por RLS.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { campaignsApi, type CreateCampaignBody } from '@/components/crm/whatsapp/api';
import type { Campaign } from './types';

export interface SegmentOption { id: string; name: string; customer_count: number }
export interface StageOption { id: string; name: string; pipeline_id: string; position?: number | null }
export interface PipelineOption { id: string; name: string; is_default?: boolean | null }

export const CampanasService = {
  getCampaigns: (q: { status?: string; channel?: string; q?: string } = {}) => campaignsApi.list(q).then((r) => r.data),
  /** Lista + `can_manage` (admin de organización): lanzar/pausar/reanudar/cancelar lo exigen. */
  getCampaignsWithPermissions: (q: { status?: string; channel?: string; q?: string } = {}) => campaignsApi.list(q),
  getCampaignById: (id: string) => campaignsApi.get(id).then((r) => r.data).catch(() => null),
  getCampaignWithPermissions: (id: string) => campaignsApi.get(id).catch(() => null),
  createCampaign: (input: CreateCampaignBody) => campaignsApi.create(input).then((r) => r.data),
  updateCampaign: (id: string, input: Partial<CreateCampaignBody>) => campaignsApi.update(id, input).then((r) => r.data),
  deleteCampaign: (id: string) => campaignsApi.remove(id).then(() => true),
  duplicateCampaign: async (id: string): Promise<Campaign> => {
    const c = await campaignsApi.get(id).then((r) => r.data);
    return campaignsApi.create({ name: `${c.name} (copia)`, channel: c.channel ?? 'whatsapp', channel_id: c.statistics.channel_id ?? null, template_id: c.template_id, content: c.content, audience: c.statistics.audience ?? { source: 'manual', customer_ids: [] }, throttle_mps: c.statistics.throttle_mps, respect_allowed_hours: c.statistics.respect_allowed_hours, default_variables: c.statistics.default_variables, purpose: c.statistics.purpose }).then((r) => r.data);
  },
  materialize: campaignsApi.materialize,
  launch: campaignsApi.launch,
  pause: campaignsApi.pause,
  resume: campaignsApi.resume,
  cancel: campaignsApi.cancel,
  stats: campaignsApi.stats,
  contacts: campaignsApi.contacts,
  csvUrl: campaignsApi.csvUrl,

  async getStats(): Promise<{ total: number; draft: number; scheduled: number; sending: number; sent: number; paused: number }> {
    const list = await campaignsApi.list().then((r) => r.data);
    const n = (s: string) => list.filter((c) => c.effective_status === s).length;
    return { total: list.length, draft: n('draft'), scheduled: n('scheduled'), sending: n('sending'), sent: n('sent'), paused: n('paused') };
  },

  async getSegments(): Promise<SegmentOption[]> {
    const { data } = await supabase.from('segments').select('id, name, customer_count').eq('organization_id', getOrganizationId()).order('name');
    return (data ?? []) as SegmentOption[];
  },
  async getPipelines(): Promise<PipelineOption[]> {
    const { data } = await supabase.from('pipelines').select('id, name, is_default').eq('organization_id', getOrganizationId()).order('name');
    return (data ?? []) as PipelineOption[];
  },
  async getStages(pipelineId: string): Promise<StageOption[]> {
    const { data } = await supabase.from('stages').select('id, name, pipeline_id, position').eq('pipeline_id', pipelineId).order('position');
    return (data ?? []) as StageOption[];
  },
};
