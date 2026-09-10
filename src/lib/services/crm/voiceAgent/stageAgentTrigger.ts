/**
 * Productor de llamadas del agente IA al ENTRAR en una etapa (FASE 06, ronda 2).
 *
 * F-NEW-4 del tester: `stage_agents.trigger_on = 'enter'` se guardaba y se pintaba,
 * pero nadie lo leía para actuar. El manejador de cola `ai_call` estaba registrado
 * y no había ningún productor: el único camino automático era la campaña por cron.
 *
 * Aquí se cierra el circuito:
 *
 *   trigger BD `trg_opp_stage_change_enqueue` → `crm_events`
 *     → job `crm_event` → `dispatchCrmEvent('opportunity.stage_changed')`
 *       → ESTE listener → `enqueueJob({ kind: 'ai_call' })`
 *         → handler `ai_call` → `dispatchAgentCall()` (con todas sus barreras)
 *
 * El listener NO marca: solo encola. Todas las barreras (canal habilitado, agente
 * activo, franja horaria, topes, concurrencia, deduplicación y consentimiento)
 * viven en `dispatchAgentCall`, que es el único camino de marcación.
 *
 * Idempotencia: `dedupe_key = ai_call:stage_enter:{stage_agent_id}:{opportunity_id}`.
 * Si el evento se reintenta, `fn_enqueue_job` devuelve el job existente en vez de
 * crear otro.
 */

import { onCrmEvent, type CrmEventListener } from '@/lib/jobs/dispatch/eventDispatcher';
import { enqueueJob } from '@/lib/jobs/enqueue';

export const STAGE_AGENT_LISTENER_NAME = 'stage_agent_ai_call';

interface StageAgentRow {
  id: string;
  voice_agent_id: string | null;
  trigger_on: string;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean;
}

export const stageAgentAiCallListener: CrmEventListener = async (event, { supabase, orgId, log }) => {
  if (event.entity_type !== 'opportunity') return { skipped: true, reason: 'entity_not_opportunity' };

  const toStageId = typeof event.payload.to_stage_id === 'string' ? event.payload.to_stage_id : null;
  if (!toStageId) return { skipped: true, reason: 'no_to_stage' };

  // A-F6-22: ninguna lectura descarta el error.
  const saRes = await supabase
    .from('stage_agents')
    .select('id, voice_agent_id, trigger_on, trigger_config, is_active')
    .eq('organization_id', orgId)
    .eq('stage_id', toStageId)
    .eq('channel', 'voice')
    .eq('is_active', true)
    .maybeSingle();
  if (saRes.error) throw new Error(`stage_agents: ${saRes.error.message}`);

  const stageAgent = saRes.data as StageAgentRow | null;
  if (!stageAgent) return { skipped: true, reason: 'sin_agente_en_la_etapa' };
  if (stageAgent.trigger_on !== 'enter') {
    return { skipped: true, reason: `trigger_on=${stageAgent.trigger_on}` };
  }

  // Sin agente de voz asignado no hay a quién llamar: el dueño debe elegirlo en
  // la pestaña «Agente IA» de la etapa.
  if (!stageAgent.voice_agent_id) {
    log.warn('stage_agent_sin_voice_agent', { stage_agent_id: stageAgent.id, stage_id: toStageId });
    return { skipped: true, reason: 'stage_agent_sin_voice_agent' };
  }

  const oppRes = await supabase
    .from('opportunities')
    .select('id, customer_id, status')
    .eq('id', event.entity_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (oppRes.error) throw new Error(`opportunities: ${oppRes.error.message}`);
  const opp = oppRes.data as { id: string; customer_id: string | null; status: string } | null;
  if (!opp) return { skipped: true, reason: 'oportunidad_no_encontrada' };
  if (opp.status !== 'open') return { skipped: true, reason: `oportunidad_${opp.status}` };
  if (!opp.customer_id) return { skipped: true, reason: 'oportunidad_sin_cliente' };

  // Retardo opcional configurado por el dueño (`trigger_config.delay_minutes`).
  const delayMinutes = Number((stageAgent.trigger_config || {}).delay_minutes);
  const runAt = Number.isFinite(delayMinutes) && delayMinutes > 0
    ? new Date(Date.now() + Math.min(delayMinutes, 60 * 24) * 60 * 1000)
    : new Date();

  const jobId = await enqueueJob({
    organizationId: orgId,
    kind: 'ai_call',
    payload: {
      voice_agent_id: stageAgent.voice_agent_id,
      opportunity_id: opp.id,
      customer_id: opp.customer_id,
      stage_agent_id: stageAgent.id,
      source: 'stage_enter',
      crm_event_id: event.id,
    },
    runAt,
    dedupeKey: `ai_call:stage_enter:${stageAgent.id}:${opp.id}`,
    supabase,
  });

  log.info('stage_agent_ai_call_enqueued', {
    job_id: jobId,
    stage_agent_id: stageAgent.id,
    opportunity_id: opp.id,
  });
  return { job_id: jobId, stage_agent_id: stageAgent.id };
};

let registered = false;

/** Registro idempotente (lo llama `src/lib/jobs/handlers/index.ts`). */
export function registerStageAgentAiCallListener(): void {
  if (registered) return;
  registered = true;
  onCrmEvent('opportunity.stage_changed', stageAgentAiCallListener, STAGE_AGENT_LISTENER_NAME);
}
