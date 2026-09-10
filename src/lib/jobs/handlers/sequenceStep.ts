import { JobFatalError, type JobHandler } from '../types';
import { processStepRun } from '@/lib/services/crm/sequenceService';

/**
 * Handler kind `sequence_step` (FASE-08 §4.4).
 *
 * payload: `{ step_run_id, enrollment_id? }`. Lo encola la RPC
 * `fn_enroll_in_sequence` (solo el PRIMER paso), `processStepRun` al terminar
 * el paso anterior (programación encadenada, tester r2 N1), o
 * `fn_resume_sequence_enrollment` al reanudar una inscripción pausada; siempre
 * con `dedupe_key = seqrun:{step_run_id}` y `run_at = scheduled_at`.
 *
 * El reclamo del paso es atómico dentro de `processStepRun`
 * (UPDATE guardado por `status='pending'`), así que dos trabajadores del mismo
 * job no ejecutan el paso dos veces. Un paso que ya no está `pending` devuelve
 * `skipped`. Un fallo es terminal: el `sequence_step_run` queda `failed` con su
 * `error_message` y reintentarlo no reejecutaría nada (el reclamo fallaría).
 */
export const sequenceStepJobHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const stepRunId = typeof job.payload?.step_run_id === 'string' ? job.payload.step_run_id : null;
  if (!stepRunId) throw new JobFatalError('payload.step_run_id requerido');

  const run = await processStepRun(stepRunId, orgId, supabase);
  log.info('sequence_step_processed', { step_run_id: stepRunId, status: run.status });

  if (run.status === 'failed') {
    throw new JobFatalError(`sequence_step_run ${stepRunId} failed: ${run.error_message ?? 'sin detalle'}`);
  }
  if (run.status === 'skipped') {
    return { skipped: true, reason: (run.result as { reason?: string } | null)?.reason ?? 'skipped', step_run_id: stepRunId };
  }
  if (run.status === 'pending') {
    // El paso NO se ejecutó y sigue vivo: o la inscripción está pausada (se
    // reencola al reanudar) o un paso anterior aún no ha terminado y este job
    // ya dejó otro programado (`waiting_previous_step`). No es un fallo.
    return {
      skipped: true,
      reason: (run.result as { reason?: string } | null)?.reason ?? 'deferred',
      step_run_id: stepRunId,
      deferred: true,
    };
  }
  return { step_run_id: stepRunId, status: run.status, result: run.result ?? null };
};
