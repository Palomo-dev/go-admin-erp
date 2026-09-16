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
 *  - r3 (QA r2 N-4): un handler que terminó BIEN nunca se vuelve a ejecutar
 *    por un fallo de `fn_complete_job`: se reintenta la RPC una vez y, si
 *    sigue fallando, el job se cierra como `failed` terminal con
 *    `last_error = 'complete_failed: …'` (`fn_fail_job(-1)`), NUNCA `queued`.
 *    Cuenta en `summary.completeFailed`. Dejarlo `running` no vale: el reclaim
 *    de 10 min lo re-encola y el efecto se repite.
 *  - r3 (N-8): un job ya ejecutado en esta invocación que `fn_claim_jobs`
 *    devuelve otra vez (`retryAfterSeconds: 0` ⇒ `run_at = now()`) se libera y
 *    se corta el bucle: el siguiente cron lo recoge, no se queman intentos.
 */

const DEFAULT_LIMIT = 25;
const DEFAULT_DEADLINE_MS = 50_000;
const DEFAULT_JOB_TIMEOUT_MS = 30_000;
/** Margen mínimo para intentar un job más antes del deadline. */
const MIN_REMAINING_MS = 1_500;
/**
 * Espera entre los dos intentos de `fn_complete_job` (r4, tester r3 T-6): un
 * blip de red de milisegundos no debe convertir un job exitoso en `failed`
 * terminal. Solo se espera si queda presupuesto para ello.
 */
export const COMPLETE_RETRY_DELAY_MS = 300;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
 *  1. `fn_release_job(p_job_id, p_worker)` (DB-r2 + crm_v4_f00_37): queued +
 *     attempts-1, `releases+1`, `run_at = now() + backoff` y `dead` al llegar
 *     al tope (QA F0-DB r2, problema 7). No toca last_error salvo al morir.
 *  2. Si la RPC aún no existe (PGRST202 / 42883): UPDATE guardado por
 *     `status='running' AND locked_by=worker` que replica la misma regla con
 *     `releaseBackoffSeconds` / `releaseCap`. `releases` solo se escribe si la
 *     fila reclamada trae la columna (RETURNING j.* de fn_claim_jobs); si no
 *     existe todavía, se aplica el backoff pero no el tope.
 *
 * `releaseRpcMissing` se memoriza por ejecución para no repetir la RPC fallida.
 */
const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

/** Backoff de una liberación: 30 s · 2^(releases-1), tope 15 min (30, 60, 120, 240, 480, 900, 900…). */
export const RELEASE_BACKOFF_BASE_SECONDS = 30;
export const RELEASE_BACKOFF_MAX_SECONDS = 900;

export function releaseBackoffSeconds(releases: number): number {
  const n = Math.max(1, Math.floor(releases));
  return Math.min(RELEASE_BACKOFF_BASE_SECONDS * 2 ** (n - 1), RELEASE_BACKOFF_MAX_SECONDS);
}

/** Tope de liberaciones por job: el doble de `max_attempts` (10 con el default 5). */
export function releaseCap(maxAttempts: number): number {
  return Math.max(1, Math.floor(maxAttempts)) * 2;
}

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
  const releases = typeof job.releases === 'number' ? job.releases + 1 : undefined;
  const exhausted = releases !== undefined && releases >= releaseCap(job.max_attempts);
  const runAt = new Date(Date.now() + releaseBackoffSeconds(releases ?? 1) * 1000).toISOString();
  const values: Record<string, unknown> = {
    status: exhausted ? 'dead' : 'queued',
    locked_at: null,
    locked_by: null,
    attempts: Math.max(0, (job.attempts ?? 1) - 1),
    run_at: runAt,
  };
  if (releases !== undefined) values.releases = releases;
  if (exhausted) values.last_error = `released_limit: ${releases} liberaciones por deadline (worker ${worker})`.slice(0, 4000);
  const { error } = await sb
    .from('outbound_jobs')
    .update(values)
    .eq('id', job.id)
    .eq('status', 'running')
    .eq('locked_by', worker);
  if (error) throw new Error(`release: ${error.message}`);
  return 'fallback';
}

/**
 * Ejecuta el handler con timeout y AbortSignal.
 *
 * El timeout es ADVISORY (QA r2 N-4): `Promise.race` deja de esperar, pero la
 * promesa del handler sigue viva hasta que él mismo mire `signal`. Por eso los
 * handlers con efectos externos (`whatsapp`, `email`, `transcribe`) comprueban
 * `signal.aborted` ANTES del efecto y son idempotentes por estado de la
 * entidad: si terminan después de que el job volviera a la cola, el reintento
 * no repite el envío.
 */
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
  /** Ids ya ejecutados en ESTA invocación (N-8). */
  const executed = new Set<string>();

  try {
    // Bucle de lotes: sigue mientras el lote venga lleno y quede presupuesto.
    for (;;) {
      let sawRepeat = false;
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

        // N-8: ya lo ejecutamos en esta invocación (re-encolado sin backoff).
        // Se devuelve a la cola sin quemar el intento y el bucle termina tras el lote.
        if (executed.has(job.id)) {
          sawRepeat = true;
          try {
            const via = await releaseJob(sb, job, worker, releaseState);
            summary.released += 1;
            if (via === 'fallback') summary.releasedWithoutRpc = (summary.releasedWithoutRpc ?? 0) + 1;
            rootLog.warn('job_repeated_in_run', { job_id: job.id, kind: job.kind });
          } catch (err) {
            rootLog.error('release_failed', { job_id: job.id, error: errorMessage(err) });
          }
          continue;
        }
        executed.add(job.id);

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

        // 1) Handler. Sus errores van al `catch` (fn_fail_job con la política del error).
        let resultObj: Record<string, unknown> | null = null;
        let handlerOk = false;
        try {
          const result = await runWithTimeout(
            (signal) => handler({ job, supabase: sb, orgId: job.organization_id, log, signal }),
            Math.min(jobTimeoutMs, Math.max(remaining - 500, 250)),
          );
          // N-9: el contrato es "registro plano"; un array también es `object` pero no vale como `p_result`.
          resultObj = result && typeof result === 'object' && !Array.isArray(result) ? result : null;
          handlerOk = true;
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
        if (!handlerOk) continue;

        // 2) Completar. Separado del `try` del handler (N-4): un fallo aquí NUNCA
        // re-encola el job (el efecto ya ocurrió). Reintento único de la RPC y,
        // si persiste, cierre terminal `failed` con `complete_failed:`.
        let acknowledged: boolean | null = null;
        let completeError = '';
        for (let attempt = 0; attempt < 2 && acknowledged === null; attempt++) {
          if (attempt > 0 && deadlineAt - Date.now() > COMPLETE_RETRY_DELAY_MS) await sleep(COMPLETE_RETRY_DELAY_MS);
          try {
            acknowledged = await completeJob(sb, job, worker, resultObj);
          } catch (err) {
            completeError = errorMessage(err);
            log.warn('complete_rpc_error', { attempt: attempt + 1, error: completeError });
          }
        }
        if (acknowledged === null) {
          summary.completeFailed = (summary.completeFailed ?? 0) + 1;
          try {
            const status = await failJob(sb, job, worker, `complete_failed: ${completeError}`.slice(0, 4000), { retryable: false });
            log.error('job_complete_failed', { rpc_status: status, error: completeError, ms: Date.now() - jobStarted });
            if (status !== 'ignored') {
              summary.failed += 1;
              bump(job.kind, 'failed');
            }
          } catch (rpcErr) {
            // Ni complete ni fail responden: queda `running` y lo rescata el reclaim (intento quemado, efecto YA hecho).
            log.error('job_complete_failed', { rpc_status: 'unreachable', error: completeError, fail_error: errorMessage(rpcErr), ms: Date.now() - jobStarted });
          }
          continue;
        }
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
      }

      if (sawRepeat || batch.length < limit) break;
    }
  } catch (err) {
    // Último cinturón: el runner nunca lanza.
    rootLog.error('runner_unexpected', { error: errorMessage(err) });
  }

  summary.ms = Date.now() - started;
  rootLog.info('runner_summary', { ...summary });
  return summary;
}
