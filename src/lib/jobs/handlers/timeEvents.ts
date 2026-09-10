import { type JobHandler } from '../types';
import { processPendingStepRuns, type SweepCounters } from '@/lib/services/crm/sequenceService';
import {
  SEQUENCE_SWEEP_BATCH,
  SEQUENCE_SWEEP_INTERVAL_MS,
  hasLiveEnrollments,
  scheduleSequenceSweep,
  sequenceSweepDedupeKey,
} from '@/lib/services/crm/sequenceSweep';

/**
 * Handler kind `time_events` (FASE-08 §4.4) — barrido de respaldo por
 * organización.
 *
 * Corrige el hallazgo N2 del tester r2: `reclaimStaleStepRuns` y
 * `processPendingStepRuns` existían pero **no las llamaba nadie**, así que un
 * job `sequence_step` que agotaba sus 3 intentos dejaba el paso sin ejecutar,
 * la inscripción `active` para siempre y —por el índice único parcial— la
 * oportunidad sin poder reinscribirse.
 *
 * Qué hace, para la organización del job:
 *   1. Devuelve a `pending` los `sequence_step_runs` que quedaron `running`
 *      tras una caída (dentro de `processPendingStepRuns`).
 *   2. Ejecuta los `pending` ya vencidos (los que perdieron su job). El orden
 *      lo protege la guarda `waiting_previous_step` de `processStepRun`, y
 *      cada paso va con su propio `try/catch` (ronda 3, N9): un run defectuoso
 *      ya no envenena el lote entero.
 *   3. Se REPROGRAMA mientras queden inscripciones vivas (`active|paused`) en
 *      la organización; cuando no queda ninguna, la cadena se apaga sola.
 *
 * Ronda 3 — el barrido no puede quedarse muerto (tester N9):
 *   - la reprogramación se ejecuta SIEMPRE, en su propio bloque, después del
 *     barrido y antes de propagar cualquier fallo: un error del lote ya no
 *     deja a la organización a ciegas;
 *   - `scheduleSequenceSweep` resuelve el choque de la clave de deduplicación
 *     con el propio job en curso (ver el módulo `sequenceSweep`);
 *   - si el propio reprogramado falla, se registra `sweep_reschedule_failed` y
 *     el error se propaga: el job queda `failed`/`dead` **a la vista**, nunca
 *     un éxito falso;
 *   - `sequenceService.advanceChain` resiembra el barrido cuando no consigue
 *     encolar el paso siguiente, así que la red tiene red.
 *
 * La siembra inicial la hacen `fn_enroll_in_sequence` y
 * `fn_resume_sequence_enrollment` (`crm_v4_f08_03_enroll_chain_and_resume`),
 * con `dedupe_key = time_events:{org}`.
 */

export {
  SEQUENCE_SWEEP_BATCH,
  SEQUENCE_SWEEP_INTERVAL_MS,
  hasLiveEnrollments,
  scheduleSequenceSweep,
  sequenceSweepDedupeKey,
};

export const timeEventsJobHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const currentJobId = job?.id ?? null;
  let swept: SweepCounters | null = null;
  let sweepError: unknown = null;

  try {
    swept = await processPendingStepRuns(orgId, supabase, SEQUENCE_SWEEP_BATCH);
  } catch (err) {
    sweepError = err;
  }

  // Reprogramación pase lo que pase: si esto viviera en el camino feliz, un
  // barrido fallido dejaría a la organización sin red para siempre (N9).
  let live: boolean | null = null;
  let rescheduled: string | null = null;
  try {
    live = await hasLiveEnrollments(orgId, supabase);
    if (live) rescheduled = await scheduleSequenceSweep(orgId, supabase, SEQUENCE_SWEEP_INTERVAL_MS, currentJobId);
  } catch (schedErr) {
    const message = schedErr instanceof Error ? schedErr.message : String(schedErr);
    log.error('sweep_reschedule_failed', { org_id: orgId, error: message });
    // Sin sucesor la fase se queda ciega: se propaga para que el job quede
    // `failed`/`dead` y se vea en el monitor, nunca un éxito silencioso.
    if (!sweepError) throw new Error(`timeEvents(reschedule): ${message}`);
  }

  if (sweepError) {
    const message = sweepError instanceof Error ? sweepError.message : String(sweepError);
    log.error('sequence_sweep_failed', { org_id: orgId, error: message, live, rescheduled });
    throw sweepError;
  }

  const result: SweepCounters = swept
    ?? { processed: 0, completed: 0, failed: 0, skipped: 0, reclaimed: 0, errors: 0, first_error: null };
  if (result.errors > 0) {
    log.warn('sequence_sweep_run_errors', { org_id: orgId, errors: result.errors, first_error: result.first_error ?? null });
  }
  log.info('sequence_sweep_done', { org_id: orgId, ...result, live, rescheduled });
  return { scope: 'sequences', ...result, live_enrollments: live, next_job_id: rescheduled };
};
