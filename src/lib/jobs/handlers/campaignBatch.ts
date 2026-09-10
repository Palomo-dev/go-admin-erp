import { JobFatalError, type JobHandler } from '../types';
import { runCampaignBatch } from '@/lib/services/crm/whatsapp/campaignBatch';

/**
 * Handler kind 'campaign_batch' (FASE-16 §4.4): `{ campaign_id, batch_no }`.
 * Reemplaza el placeholder de F0. El lote no se reintenta como unidad: cada
 * contacto tiene sus `attempts`; el siguiente lote se encola con dedupe
 * `campaign_batch:{id}:{n+1}`. Presupuesto ≤25 s (jobTimeoutMs 30 s).
 *
 * Multi-tenant (tester r1 · fallo 5): la campaña se carga con service role por
 * id, así que la org del JOB se pasa como `expectedOrgId` y el lote se rechaza
 * si no coincide con `campaigns.organization_id`.
 */
export const campaignBatchHandler: JobHandler = async ({ job, supabase, orgId, log, signal }) => {
  const campaignId = String(job.payload?.campaign_id ?? '');
  if (!campaignId) throw new JobFatalError('payload.campaign_id requerido');
  const result = await runCampaignBatch(
    { campaign_id: campaignId, batch_no: Number(job.payload?.batch_no ?? 1) },
    supabase,
    { signal, log, deadlineMs: 25_000, expectedOrgId: orgId ?? null },
  );
  if (result.reason === 'campaign_not_found') throw new JobFatalError(`campaña ${campaignId} no existe`);
  if (result.reason === 'org_mismatch') throw new JobFatalError(`la campaña ${campaignId} no pertenece a la organización ${orgId} del job`);
  log.info('campaign_batch', { org_id: orgId, ...result });
  return { ...result, skipped: result.claimed === 0 && result.finished ? true : undefined };
};
