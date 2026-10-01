/** Voz: una sola escritura transaccional tras autorizar organización y permiso. */
import { requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { CRM_PERMISOS, CrmHttpError, exigirUuid, type CrmSesion } from './crmRouteSupport';
import { voiceCampaignCreateSchema, voiceCampaignUpdateSchema, voiceCampaignVersionSchema, voiceCampaignStopSchema } from './voiceCampaignWriteLogica';
import type { VoiceAgentCampaign } from './voiceAgentService';
export { voiceCampaignCreateSchema, voiceCampaignUpdateSchema } from './voiceCampaignWriteLogica';

async function versionPropia(ctx: CrmSesion, id: string, expected?: string): Promise<string> {
  const { data, error } = await ctx.supabase.from('voice_agent_campaigns').select('id, updated_at')
    .eq('id', id).eq('organization_id', ctx.organizationId).is('stats->>archived_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'campana_no_encontrada', 'Campaña no encontrada');
  // Compatibilidad con clientes anteriores. Las pantallas nuevas envían la versión que vieron.
  return expected ?? data.updated_at;
}
async function mutar(ctx: CrmSesion, fn: string, id: string | null, version: string | null, extra: Record<string, unknown> = {}): Promise<VoiceAgentCampaign> {
  const { data, error } = await getServiceClient().rpc(fn, {
    p_org: ctx.organizationId, p_campaign: id, p_version: version, p_actor: ctx.userId, ...extra,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.organization_id !== ctx.organizationId ||
    typeof data.id !== 'string' || (id !== null && data.id !== id) || typeof data.updated_at !== 'string')
    throw new CrmHttpError(500, 'respuesta_invalida', 'Respuesta inválida de campaña');
  return data as VoiceAgentCampaign;
}
export async function guardarCampanaVoz(ctx: CrmSesion, body: unknown, id?: string): Promise<VoiceAgentCampaign> {
  await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
  const parsed = (id ? voiceCampaignUpdateSchema : voiceCampaignCreateSchema).safeParse(body);
  if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Datos de campaña inválidos');
  const { expected_updated_at, ...values } = parsed.data as typeof voiceCampaignUpdateSchema._type;
  const campaignId = id ? exigirUuid(id) : null;
  const version = campaignId ? await versionPropia(ctx, campaignId, expected_updated_at) : null;
  return mutar(ctx, 'crm_voice_campaign_save', campaignId, version, { p_values: values });
}
export async function eliminarCampanaVoz(ctx: CrmSesion, id: string, body: unknown = {}): Promise<void> {
  await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
  const parsed = voiceCampaignVersionSchema.safeParse(body);
  if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Versión de campaña inválida');
  const campaignId = exigirUuid(id);
  await mutar(ctx, 'crm_voice_campaign_archive', campaignId, await versionPropia(ctx, campaignId, parsed.data.expected_updated_at));
}
export async function detenerCampanaVoz(ctx: CrmSesion, id: string, body: unknown): Promise<VoiceAgentCampaign> {
  await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
  const parsed = voiceCampaignStopSchema.safeParse(body);
  if (!parsed.success) throw new CrmHttpError(400, 'motivo_invalido', 'Escribe el motivo');
  const campaignId = exigirUuid(id);
  return mutar(ctx, 'crm_voice_campaign_stop', campaignId, await versionPropia(ctx, campaignId, parsed.data.expected_updated_at), { p_reason: parsed.data.reason });
}
