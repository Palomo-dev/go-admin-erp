import { registerJobHandler } from '../registry';
import type { JobHandler, JobKind } from '../types';
import { noopHandler } from './noop';
import { crmEventHandler } from './crmEvent';
import { maintenanceHandler } from './maintenance';
import { emailJobHandler } from './email';
import { transcribeHandler } from './transcribe';
import { analyzeHandler } from './analyze';
import { recordingFetchHandler } from './recordingFetch';
import { recordingCleanupHandler } from './recordingCleanup';
import { whatsappJobHandler } from './whatsapp';
import { campaignBatchHandler } from './campaignBatch';
import { registerStageChangedActivityListener } from '../dispatch/listeners/stageChangedActivity';
// F6: productor de `ai_call` al ENTRAR en una etapa con `stage_agents.trigger_on='enter'`.
import { registerStageAgentAiCallListener } from '@/lib/services/crm/voiceAgent/stageAgentTrigger';
import './f8Automations'; // F8: handlers `automation` y `sequence_step` + listeners del outbox

/**
 * Registro (side-effect) de handlers y listeners de F0.
 *
 * Fases posteriores añaden aquí su import + registerJobHandler:
 *   F3/F4: recording_cleanup, transcribe, analyze
 *   F6:    ai_call
 *   F7:    email
 *   F8:    automation, sequence_step (+ listeners en eventDispatcher)
 *   F16:   whatsapp, campaign_batch
 *   F8:    sms
 *
 * Los kinds con hook pendiente se registran como PLACEHOLDER: el runner los
 * completa como `skipped` (sin marcar dead) hasta que la fase registre el
 * handler real, que sobreescribe el placeholder sin aviso.
 */

const PLACEHOLDER_KINDS: JobKind[] = [];

const placeholderHandler: JobHandler = async ({ job, log }) => {
  log.warn('handler_not_registered', { kind: job.kind });
  return { skipped: true, reason: 'handler_not_registered', kind: job.kind };
};

registerJobHandler('noop', noopHandler);
registerJobHandler('crm_event', crmEventHandler);
registerJobHandler('maintenance', maintenanceHandler);
registerJobHandler('email', emailJobHandler); // F7
registerJobHandler('transcribe', transcribeHandler); // F4
registerJobHandler('analyze', analyzeHandler); // F4
registerJobHandler('recording_fetch', recordingFetchHandler); // F3
registerJobHandler('recording_cleanup', recordingCleanupHandler); // F3 (reemplaza el placeholder de F0)
registerJobHandler('whatsapp', whatsappJobHandler); // F16 (envío programado)
registerJobHandler('campaign_batch', campaignBatchHandler); // F16 (reemplaza el placeholder de F0)
// F6: llamada del agente de voz. Sin este registro, un agente configurado para
// dispararse al entrar en una etapa no hace nada (el despacho manual y las
// campañas sí funcionan, porque no pasan por la cola). La importación es
// perezosa para no arrastrar el servicio de voz al arranque del runner.
registerJobHandler('ai_call', async ({ job }) => {
  const { dispatchAgentCall } = await import('@/lib/services/crm/voiceAgentService');
  const { getServiceClient } = await import('@/lib/supabase/server-service');
  const p = job.payload as { voice_agent_id: string; opportunity_id?: string; customer_id?: string };
  const result = await dispatchAgentCall(job.organization_id, getServiceClient(), {
    voiceAgentId: p.voice_agent_id,
    opportunityId: p.opportunity_id ?? null,
    customerId: p.customer_id ?? null,
  });
  // `JobHandlerResult` es un registro plano; el resultado del despacho es una
  // interfaz sin firma de índice, así que se envuelve en vez de forzar el tipo.
  return { ...result };
});
for (const kind of PLACEHOLDER_KINDS) registerJobHandler(kind, placeholderHandler, { placeholder: true });

registerStageChangedActivityListener();
registerStageAgentAiCallListener(); // F6

export { noopHandler, crmEventHandler, maintenanceHandler, placeholderHandler, transcribeHandler, analyzeHandler, recordingFetchHandler, recordingCleanupHandler, whatsappJobHandler, campaignBatchHandler };
