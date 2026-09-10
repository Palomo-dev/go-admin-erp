import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { hasRealJobHandler } from './registry';
import { enqueueJob } from './enqueue';
import { runMaintenance, type MaintenanceResult } from './handlers/maintenance';
import { makeJobLogger } from './runner';
import type { JobKind } from './types';

/**
 * Productor de los trabajos programados (tester r1 F-1): hasta la ronda 1 el
 * cron diario solo DRENABA `?kind=maintenance` y nadie encolaba ese job.
 *
 * Kinds "programados" (los pide un cron, no un usuario/servicio):
 *
 *  - `maintenance` → GLOBAL. `outbound_jobs.organization_id` es NOT NULL + FK,
 *    así que no hay una fila válida para un job del sistema y encolar uno por
 *    org sería N limpiezas globales idénticas. Se ejecuta DIRECTAMENTE
 *    (`runMaintenance`, idempotente) con el presupuesto que quede del runner.
 *    Si pg_cron y Vercel disparan el mismo minuto se ejecuta dos veces: es
 *    inocuo (DELETEs idempotentes, resync con dedupe).
 *
 *  - `recording_cleanup` → POR ORG (F3 registra el handler real). Se encola
 *    un job por org con `comm_settings.is_active` y dedupe
 *    `recording_cleanup:{yyyy-mm-dd}` (singleton diario por org). Mientras el
 *    handler sea el placeholder de F0 NO se encola nada (evita 30+ jobs
 *    `skipped` al día); `scheduled.recording_cleanup.reason = 'handler_not_registered'`.
 *
 * Solo se activa cuando la petición trae explícitamente esos kinds
 * (`?kind=`, body.kinds o `x-vercel-cron-schedule`); el drenaje sin kinds
 * (cada minuto) no lo dispara.
 */
export const SCHEDULED_KINDS: readonly JobKind[] = ['maintenance', 'recording_cleanup'];

export interface ScheduledRunResult {
  maintenance?: { ok: true; ms: number; result: MaintenanceResult } | { ok: false; ms: number; error: string };
  recording_cleanup?: { enqueued: number; orgs: number; reason?: string; error?: string };
}

export interface RunScheduledOptions {
  kinds: readonly JobKind[];
  /** Presupuesto en ms (se aborta el mantenimiento al agotarse). */
  budgetMs: number;
  worker: string;
  supabase?: SupabaseClient;
  now?: Date;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 2000);
}

export function hasScheduledKinds(kinds: readonly JobKind[] | undefined): boolean {
  return !!kinds && kinds.some((k) => SCHEDULED_KINDS.includes(k));
}

export async function runScheduledKinds(opts: RunScheduledOptions): Promise<ScheduledRunResult> {
  const out: ScheduledRunResult = {};
  if (!hasScheduledKinds(opts.kinds)) return out;
  const log = makeJobLogger({ worker: opts.worker, src: 'jobs.scheduler' });

  let sb: SupabaseClient;
  try {
    sb = opts.supabase ?? getServiceClient();
  } catch (err) {
    log.error('scheduler_no_client', { error: errorMessage(err) });
    return out;
  }

  if (opts.kinds.includes('maintenance')) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(250, opts.budgetMs));
    try {
      const result = await runMaintenance(sb, log, controller.signal);
      out.maintenance = { ok: true, ms: Date.now() - started, result };
    } catch (err) {
      out.maintenance = { ok: false, ms: Date.now() - started, error: errorMessage(err) };
      log.error('maintenance_failed', { error: out.maintenance.error });
    } finally {
      clearTimeout(timer);
    }
  }

  if (opts.kinds.includes('recording_cleanup')) {
    if (!hasRealJobHandler('recording_cleanup')) {
      out.recording_cleanup = { enqueued: 0, orgs: 0, reason: 'handler_not_registered' };
    } else {
      out.recording_cleanup = await enqueueRecordingCleanup(sb, opts.now ?? new Date(), log);
    }
  }

  return out;
}

async function enqueueRecordingCleanup(
  sb: SupabaseClient,
  now: Date,
  log: ReturnType<typeof makeJobLogger>,
): Promise<NonNullable<ScheduledRunResult['recording_cleanup']>> {
  const { data, error } = await sb.from('comm_settings').select('organization_id').eq('is_active', true).limit(1000);
  if (error) {
    log.error('recording_cleanup_orgs_failed', { error: error.message });
    return { enqueued: 0, orgs: 0, error: error.message };
  }
  const orgIds = Array.from(new Set(((data ?? []) as { organization_id: number }[]).map((r) => r.organization_id))).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  let enqueued = 0;
  for (const organizationId of orgIds) {
    try {
      await enqueueJob({
        organizationId,
        kind: 'recording_cleanup',
        payload: { scheduled_for: dayKey(now) },
        dedupeKey: `recording_cleanup:${dayKey(now)}`,
        maxAttempts: 3,
        supabase: sb,
      });
      enqueued += 1;
    } catch (err) {
      log.warn('recording_cleanup_enqueue_failed', { org_id: organizationId, error: errorMessage(err) });
    }
  }
  return { enqueued, orgs: orgIds.length };
}
