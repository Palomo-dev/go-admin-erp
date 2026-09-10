import os from 'os';
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getJobHandler } from './registry';
import {
  JobFatalError,
  JobRetryableError,
  isJobKind,
  type JobKind,
  type JobLogger,
  type JobOutcome,
  type KindCounters,
  type OutboundJob,
  type RunJobsOptions,
  type RunJobsSummary,
} from './types';
// Side-effect: registra los handlers de F0 (noop, crm_event, maintenance, placeholders).
import './handlers';

/**
 * Runner de la cola `outbound_jobs` (FASE-00 §2.2–2.3, §4.4).
 *
 *   claim (fn_claim_jobs, FOR UPDATE SKIP LOCKED) → por job:
 *     handler? no → fn_fail_job(-1) ('no_handler') → `failed` terminal
 *     sí → ejecutar con timeout (30 s) → fn_complete_job / fn_fail_job
 *   repetir mientras quede presupuesto (deadlineMs) y el lote venga lleno.
 *
 * Semántica de `fn_fail_job` (verificada en BD 2026-09-08):
 *   p_retry_after_seconds < 0 → 'failed' (terminal, no reintentable)
 *   attempts >= max_attempts  → 'dead'
 *   si no                     → 'queued' con backoff 60s*2^attempts (máx 1 h) o el retraso explícito
 *
 * Garantías:
 *  - NUNCA lanza: cualquier error se refleja en el resumen y en logs JSON.
 *  - Idempotente frente a invocaciones concurrentes (SKIP LOCKED + locked_by).
 *  - Cada job termina en done|queued(retry)|failed|dead; los que no alcanzan a
 *    ejecutarse por el deadline se liberan (`released`) devolviendo el intento
 *    que sumó el claim (`fn_release_job` o fallback UPDATE, tester r1 F-4).
 *  - Si se piden kinds y ninguno es válido, no se reclama nada (tester r1 F-3).
 */

const DEFAULT_LIMIT = 25;
const DEFAULT_DEADLINE_MS = 50_000;
const DEFAULT_JOB_TIMEOUT_MS = 30_000;
/** Margen mínimo para intentar un job más antes del deadline. */
const MIN_REMAINING_MS = 1_500;

export function makeWorkerId(): string {
  let host = 'worker';
  try {
    host = os.hostname() || host;
  } catch {
    /* entornos sin os.hostname */
  }
  const pid = typeof process !== 'undefined' && process.pid ? process.pid : 0;
  return `${host}-${pid}-${randomBytes(3).toString('hex')}`;
}

export function makeJobLogger(base: Record<string, unknown>): JobLogger {
  const emit = (level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) => {
    const line = JSON.stringify({ level, src: 'jobs', ts: new Date().toISOString(), msg, ...base, ...(extra ?? {}) });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 4000);
  return String(err).slice(0, 4000);
}

async function claimJobs(sb: SupabaseClient, kinds: JobKind[] | undefined, limit: number, worker: string) {
  const { data, error } = await sb.rpc('fn_claim_jobs', {
    p_kinds: kinds && kinds.length ? kinds : null,
    p_limit: limit,
    p_worker: worker,
  });
  if (error) throw new Error(`fn_claim_jobs: ${error.message}`);
  return (data ?? []) as OutboundJob[];
}

/** `fn_complete_job` devuelve false si el lock ya no era nuestro (job reclamado por otro worker). */
async function completeJob(sb: SupabaseClient, job: OutboundJob, worker: string, result: Record<string, unknown> | null): Promise<boolean> {
  const { data, error } = await sb.rpc('fn_complete_job', { p_job_id: job.id, p_worker: worker, p_result: result });
  if (error) throw new Error(`fn_complete_job: ${error.message}`);
  return data !== false;
}

interface FailOptions {
  retryable: boolean;
  retryAfterSeconds?: number;
}

/** Valor de `p_retry_after_seconds` que `fn_fail_job` interpreta como "no reintentar" (→ `failed` terminal). */
const NON_RETRYABLE_SENTINEL = -1;

/**
 * Devuelve el estado que dejó la RPC: 'queued' (retry con backoff) |
 * 'failed' (terminal, no reintentable) | 'dead' (agotó intentos) |
 * 'ignored' (el job ya no estaba running con nuestro lock).
 */
async function failJob(sb: SupabaseClient, job: OutboundJob, worker: string, message: string, opts: FailOptions): Promise<string> {
  const retryAfter = opts.retryable
    ? (opts.retryAfterSeconds !== undefined ? Math.max(0, Math.floor(opts.retryAfterSeconds)) : null)
    : NON_RETRYABLE_SENTINEL;
  const { data, error } = await sb.rpc('fn_fail_job', {
    p_job_id: job.id,
    p_worker: worker,
    p_error: message,
    p_retry_after_seconds: retryAfter,
  });
  if (error) throw new Error(`fn_fail_job: ${error.message}`);
  return typeof data === 'string' ? data : 'unknown';
}

/**
 * Libera jobs reclamados que no llegaron a ejecutarse (deadline) SIN consumir
 * el intento que sumó `fn_claim_jobs` (tester r1 F-4).
 *
 *  1. `fn_release_job(p_job_id, p_worker)` (DB-r2): queued + attempts-1, sin tocar last_error.
 *  2. Si la RPC aún no existe (PGRST202 / 42883): UPDATE guardado por
 *     `status='running' AND locked_by=worker` con `attempts = job.attempts - 1`
 *     (el valor que devolvió el claim) y sin pisar `last_error`.
 *
 * `releaseRpcMissing` se memoriza por ejecución para no repetir la RPC fallida.
 */
const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

function isRpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && RPC_MISSING_CODES.has(error.code)) return true;
  return /could not find the function|does not exist/i.test(error.message ?? '');
}

async function releaseJob(sb: SupabaseClient, job: OutboundJob, worker: string, state: { releaseRpcMissing: boolean }): Promise<'rpc' | 'fallback'> {
  if (!state.releaseRpcMissing) {
    const { error } = await sb.rpc('fn_release_job', { p_job_id: job.id, p_worker: worker });
    if (!error) return 'rpc';
    if (!isRpcMissing(error)) throw new Error(`fn_release_job: ${error.message}`);
    state.releaseRpcMissing = true;
  }
  const { error } = await sb
    .from('outbound_jobs')
    .update({ status: 'queued', locked_at: null, locked_by: null, attempts: Math.max(0, (job.attempts ?? 1) - 1) })
    .eq('id', job.id)
    .eq('status', 'running')
    .eq('locked_by', worker);
  if (error) throw new Error(`release: ${error.message}`);
  return 'fallback';
}

/** Ejecuta el handler con timeout y AbortSignal. */
async function runWithTimeout(
  fn: (signal: AbortSignal) => Promise<Record<string, unknown> | void>,
  timeoutMs: number,
): Promise<Record<string, unknown> | void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new JobRetryableError(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runJobs(opts: RunJobsOptions = {}): Promise<RunJobsSummary> {
  const started = Date.now();
  const worker = opts.worker ?? makeWorkerId();
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 200));
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const jobTimeoutMs = opts.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const deadlineAt = started + deadlineMs;
  const requestedKinds = opts.kinds;
  const kinds = requestedKinds?.filter(isJobKind);

  const summary: RunJobsSummary = {
    worker,
    claimed: 0,
    done: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    dead: 0,
    released: 0,
    ms: 0,
    byKind: {},
  };
  const bump = (kind: JobKind, key: keyof KindCounters) => {
    const entry = (summary.byKind[kind] ??= { claimed: 0, done: 0, skipped: 0, retried: 0, failed: 0, dead: 0 });
    entry[key] += 1;
  };
  /** Traduce el estado devuelto por fn_fail_job a contadores. */
  const countFailure = (kind: JobKind, status: string): JobOutcome => {
    const outcome: JobOutcome = status === 'dead' ? 'dead' : status === 'queued' ? 'retried' : 'failed';
    if (status !== 'ignored') {
      summary[outcome] += 1;
      bump(kind, outcome);
    }
    return outcome;
  };
  const rootLog = makeJobLogger({ worker });

  // F-3 (tester r1): si se pidieron kinds y ninguno es válido NO se drena
  // "todo" (antes `[]` → `p_kinds null` → todos los kinds).
  if (requestedKinds && requestedKinds.length > 0 && (!kinds || kinds.length === 0)) {
    rootLog.warn('no_valid_kinds', { requested: requestedKinds.map(String) });
    summary.ms = Date.now() - started;
    return summary;
  }

  let sb: SupabaseClient;
  try {
    sb = opts.supabase ?? getServiceClient();
  } catch (err) {
    rootLog.error('runner_no_client', { error: errorMessage(err) });
    summary.ms = Date.now() - started;
    return summary;
  }

  const releaseState = { releaseRpcMissing: false };

  try {
    // Bucle de lotes: sigue mientras el lote venga lleno y quede presupuesto.
    for (;;) {
      const remainingBeforeClaim = deadlineAt - Date.now();
      if (remainingBeforeClaim < MIN_REMAINING_MS) break;

      let batch: OutboundJob[];
      try {
        batch = await claimJobs(sb, kinds, limit, worker);
      } catch (err) {
        rootLog.error('claim_failed', { error: errorMessage(err) });
        break;
      }
      if (!batch.length) break;

      for (let i = 0; i < batch.length; i++) {
        const job = batch[i];
        const remaining = deadlineAt - Date.now();

        // Sin margen: liberar este y los siguientes del lote (no cuentan como claimed).
        if (remaining < MIN_REMAINING_MS) {
          for (const pending of batch.slice(i)) {
            try {
              const via = await releaseJob(sb, pending, worker, releaseState);
              summary.released += 1;
              if (via === 'fallback') summary.releasedWithoutRpc = (summary.releasedWithoutRpc ?? 0) + 1;
            } catch (err) {
              rootLog.error('release_failed', { job_id: pending.id, error: errorMessage(err) });
            }
          }
          break;
        }

        summary.claimed += 1;
        bump(job.kind, 'claimed');
        const log = makeJobLogger({ worker, org_id: job.organization_id, job_id: job.id, kind: job.kind, attempt: job.attempts });

        const handler = getJobHandler(job.kind);
        const jobStarted = Date.now();

        if (!handler) {
          try {
            const status = await failJob(sb, job, worker, 'no_handler', { retryable: false });
            const outcome = countFailure(job.kind, status);
            log.warn('job_failed', { outcome, reason: 'no_handler', rpc_status: status, ms: Date.now() - jobStarted });
          } catch (err) {
            log.error('fail_rpc_error', { error: errorMessage(err) });
          }
          continue;
        }

        try {
          const result = await runWithTimeout(
            (signal) => handler({ job, supabase: sb, orgId: job.organization_id, log, signal }),
            Math.min(jobTimeoutMs, Math.max(remaining - 500, 250)),
          );
          const resultObj = result && typeof result === 'object' ? result : null;
          const acknowledged = await completeJob(sb, job, worker, resultObj);
          if (!acknowledged) {
            log.warn('complete_ignored', { reason: 'lock_lost', ms: Date.now() - jobStarted });
            continue;
          }
          summary.done += 1;
          bump(job.kind, 'done');
          const skipped = !!resultObj && resultObj.skipped === true;
          if (skipped) {
            summary.skipped += 1;
            bump(job.kind, 'skipped');
          }
          log.info('job_done', { outcome: skipped ? 'skipped' : 'done', ms: Date.now() - jobStarted });
        } catch (err) {
          const message = errorMessage(err);
          const fatal = err instanceof JobFatalError;
          const retryAfterSeconds = err instanceof JobRetryableError ? err.retryAfterSeconds : undefined;
          try {
            const status = await failJob(sb, job, worker, message, { retryable: !fatal, retryAfterSeconds });
            const outcome = countFailure(job.kind, status);
            log.error('job_failed', { outcome, rpc_status: status, error: message, retry_after_s: retryAfterSeconds ?? null, ms: Date.now() - jobStarted });
          } catch (rpcErr) {
            log.error('fail_rpc_error', { error: errorMessage(rpcErr), original: message });
          }
        }
      }

      if (batch.length < limit) break;
    }
  } catch (err) {
    // Último cinturón: el runner nunca lanza.
    rootLog.error('runner_unexpected', { error: errorMessage(err) });
  }

  summary.ms = Date.now() - started;
  rootLog.info('runner_summary', { ...summary });
  return summary;
}
