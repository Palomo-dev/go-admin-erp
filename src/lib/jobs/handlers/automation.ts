import { JobFatalError, type JobHandler } from '../types';
import { executeAutomationRule } from '@/lib/services/crm/automationService';

/**
 * Handler kind `automation` (FASE-08 §4.4).
 *
 * payload: `{ rule_id, event_id?, opportunity_id?, trigger_payload? }`
 * (lo encola `automationEngine.evaluateRulesForEvent` con
 * `dedupe_key = rule:{rule_id}:event:{event_id}`).
 *
 * No se reintenta: `executeAutomationRule` ya deja el detalle por acción en
 * `automation_runs`, y un reintento re-ejecutaría las acciones que SÍ salieron
 * bien (tareas y actividades duplicadas). Un fallo se marca terminal para que
 * se vea en rojo tanto en la cola como en el historial de la regla.
 */
export const automationJobHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const ruleId = typeof job.payload?.rule_id === 'string' ? job.payload.rule_id : null;
  if (!ruleId) throw new JobFatalError('payload.rule_id requerido');

  const triggerPayload = (job.payload?.trigger_payload as Record<string, unknown> | undefined) ?? {};
  const eventId = typeof job.payload?.event_id === 'string' ? job.payload.event_id : null;

  const run = await executeAutomationRule(ruleId, orgId, triggerPayload, supabase, { eventId });

  log.info('automation_rule_executed', { rule_id: ruleId, run_id: run.id, status: run.status });

  if (run.status === 'failed') {
    throw new JobFatalError(`automation_run ${run.id} failed: ${run.error_message ?? 'sin detalle'}`);
  }
  if (run.status === 'skipped') {
    return { skipped: true, reason: run.skip_reason ?? 'skipped', run_id: run.id, rule_id: ruleId };
  }
  return { run_id: run.id, rule_id: ruleId, status: run.status };
};
