import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJob } from '../enqueue';
import { JobRetryableError, type CrmEvent, type JobHandler, type JobLogger } from '../types';

/**
 * Mantenimiento diario (FASE-00 §4.4; cron `crm-daily-maintenance` 08:30 UTC).
 *
 *  1. DELETE outbound_jobs `done` con updated_at > 30 d.
 *  2. DELETE outbound_jobs `failed|dead` con updated_at > 30 d (tester r1 F-8).
 *  3. DELETE crm_events `processed|skipped` con processed_at > 30 d.
 *  4. DELETE crm_events `failed` con created_at > 30 d (tester r1 F-8).
 *  5. Resync del outbox: crm_events `pending|failed` de entre 2 min y 7 d y
 *     con `attempts < 3` (columna DB-r2; si no existe se asume 0) → encola
 *     `crm_event` con dedupe `crm_event:{id}` (si ya hay un job vivo la RPC
 *     devuelve ese id y no duplica). Los que superan 3 intentos se cuentan
 *     como `events_abandoned` y no se vuelven a encolar.
 *
 * Es GLOBAL (service role, sin filtro por organización): la retención es del
 * sistema, no de una org. Por eso no va por la cola con un `organization_id`
 * (NOT NULL, FK) sino que el runner lo ejecuta directamente cuando el cron
 * diario pide `kind=maintenance` (`src/lib/jobs/scheduler.ts`, tester r1 F-1).
 * El handler `maintenance` sigue registrado para pruebas/encolado manual y
 * llama a la misma función. Idempotente y seguro de repetir el mismo día.
 */
const RETENTION_DAYS = 30;
const RESYNC_MIN_AGE_MINUTES = 2;
const RESYNC_MAX_AGE_DAYS = 7;
const RESYNC_BATCH = 500;
/** Máximo de intentos de procesamiento por evento antes de abandonarlo (crm_events.attempts). */
export const CRM_EVENT_MAX_ATTEMPTS = 3;

export interface MaintenanceResult extends Record<string, unknown> {
  jobs_deleted: number;
  jobs_terminal_deleted: number;
  events_deleted: number;
  events_failed_deleted: number;
  events_resynced: number;
  events_abandoned: number;
  cutoff: string;
}

export async function runMaintenance(supabase: SupabaseClient, log: JobLogger, signal: AbortSignal): Promise<MaintenanceResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();

  // outbound_jobs no tiene completed_at (schema real): updated_at se actualiza al completar.
  const { count: jobsDeleted, error: e1 } = await supabase
    .from('outbound_jobs')
    .delete({ count: 'exact' })
    .eq('status', 'done')
    .lt('updated_at', cutoff);
  if (e1) throw new JobRetryableError(`delete outbound_jobs done: ${e1.message}`);

  const { count: terminalDeleted, error: e1b } = await supabase
    .from('outbound_jobs')
    .delete({ count: 'exact' })
    .in('status', ['failed', 'dead'])
    .lt('updated_at', cutoff);
  if (e1b) throw new JobRetryableError(`delete outbound_jobs failed|dead: ${e1b.message}`);

  const { count: eventsDeleted, error: e2 } = await supabase
    .from('crm_events')
    .delete({ count: 'exact' })
    .in('status', ['processed', 'skipped'])
    .lt('processed_at', cutoff);
  if (e2) throw new JobRetryableError(`delete crm_events: ${e2.message}`);

  const { count: failedEventsDeleted, error: e2b } = await supabase
    .from('crm_events')
    .delete({ count: 'exact' })
    .eq('status', 'failed')
    .lt('created_at', cutoff);
  if (e2b) throw new JobRetryableError(`delete crm_events failed: ${e2b.message}`);

  if (signal.aborted) throw new JobRetryableError('aborted');

  // Solo eventos recientes (≤ 7 d): los más viejos en pending/failed se consideran abandonados.
  const staleCutoff = new Date(Date.now() - RESYNC_MIN_AGE_MINUTES * 60 * 1000).toISOString();
  const abandonedCutoff = new Date(Date.now() - RESYNC_MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString();
  // select('*') y no una lista de columnas: `attempts` existe solo tras DB-r2.
  const { data: stale, error: e3 } = await supabase
    .from('crm_events')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('created_at', staleCutoff)
    .gt('created_at', abandonedCutoff)
    .order('created_at', { ascending: true })
    .limit(RESYNC_BATCH);
  if (e3) throw new JobRetryableError(`select stale crm_events: ${e3.message}`);

  let resynced = 0;
  let abandoned = 0;
  for (const ev of (stale ?? []) as Pick<CrmEvent, 'id' | 'organization_id' | 'status' | 'attempts'>[]) {
    if (signal.aborted) break;
    if ((ev.attempts ?? 0) >= CRM_EVENT_MAX_ATTEMPTS) {
      abandoned += 1;
      continue;
    }
    try {
      await enqueueJob({
        organizationId: ev.organization_id,
        kind: 'crm_event',
        payload: { event_id: ev.id, resync: true },
        dedupeKey: `crm_event:${ev.id}`,
        maxAttempts: CRM_EVENT_MAX_ATTEMPTS,
        supabase,
      });
      resynced += 1;
    } catch (err) {
      log.warn('resync_enqueue_failed', { event_id: ev.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const result: MaintenanceResult = {
    jobs_deleted: jobsDeleted ?? 0,
    jobs_terminal_deleted: terminalDeleted ?? 0,
    events_deleted: eventsDeleted ?? 0,
    events_failed_deleted: failedEventsDeleted ?? 0,
    events_resynced: resynced,
    events_abandoned: abandoned,
    cutoff,
  };
  log.info('maintenance_done', result);
  return result;
}

/** Handler `maintenance` (encolado manual / smoke): delega en `runMaintenance`. */
export const maintenanceHandler: JobHandler = async ({ supabase, log, signal }) => runMaintenance(supabase, log, signal);
