import type { SupabaseClient } from '@supabase/supabase-js';
import { JOB_KINDS, JOB_STATUSES, type JobKind, type JobStatus } from '@/lib/crm/enums';

/**
 * Tipos de la cola `outbound_jobs` (FASE-00 §2.2–2.3, §4.4).
 *
 * `JOB_KINDS`/`JOB_STATUSES` viven en `src/lib/crm/enums.ts` (fuente única,
 * sincronizada con el CHECK de `outbound_jobs.kind`). Si una fase necesita un
 * kind nuevo (p. ej. `time_events`, `agent_orchestration` de F8/F6) debe pedir
 * primero la ampliación del CHECK al agente DB y luego añadirlo en enums.ts.
 *
 * Columnas verificadas en BD (2026-09-08): outbound_jobs NO tiene
 * `priority`, `created_by` ni `completed_at` (el doc M4 los listaba);
 * crm_events NO tiene `occurred_at` ni `actor_user_id` (se usa `created_at` y
 * `payload.changed_by`); `attempts`/`last_error` las añade DB-r2 y el código
 * las trata como opcionales (fallback si la columna aún no existe).
 */
export { JOB_KINDS, JOB_STATUSES };
export type { JobKind, JobStatus };

export function isJobKind(value: unknown): value is JobKind {
  return typeof value === 'string' && (JOB_KINDS as readonly string[]).includes(value);
}

/** Fila de `outbound_jobs` tal como la devuelve `fn_claim_jobs` / select. */
export interface OutboundJob {
  id: string;
  organization_id: number;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  run_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: Record<string, unknown> | null;
  locked_at: string | null;
  locked_by: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de `crm_events` (outbox). */
export const CRM_EVENT_STATUSES = ['pending', 'processed', 'failed', 'skipped'] as const;
export type CrmEventStatus = (typeof CRM_EVENT_STATUSES)[number];

export interface CrmEvent {
  id: string;
  organization_id: number;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  status: CrmEventStatus;
  /** Momento del evento (la tabla no tiene `occurred_at`). */
  created_at: string;
  processed_at: string | null;
  /** Intentos fallidos de procesamiento (columna de DB-r2; `undefined` si aún no existe). */
  attempts?: number | null;
  /** Último error de procesamiento (columna de DB-r2; `undefined` si aún no existe). */
  last_error?: string | null;
}

/** Logger estructurado (una línea JSON por evento). */
export interface JobLogger {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface JobContext {
  job: OutboundJob;
  /** Cliente service_role (bypass RLS). El handler DEBE filtrar por `orgId`. */
  supabase: SupabaseClient;
  orgId: number;
  log: JobLogger;
  /** Se aborta cuando el job supera su timeout o el runner llega al deadline. */
  signal: AbortSignal;
}

/**
 * Un handler devuelve un objeto (se guarda en `outbound_jobs.result`) o nada.
 * Si devuelve `{ skipped: true, ... }` el runner lo cuenta como `skipped`
 * (además de `done`).
 */
export type JobHandlerResult = Record<string, unknown> | void;
export type JobHandler = (ctx: JobContext) => Promise<JobHandlerResult>;

/**
 * Error reintentable con retraso explícito (p. ej. Meta 131049 → 24 h).
 * Sin `retryAfterSeconds`, `fn_fail_job` aplica el backoff exponencial.
 */
export class JobRetryableError extends Error {
  retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'JobRetryableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Error NO reintentable: el job pasa al estado terminal `failed` en el primer
 * fallo (`fn_fail_job` con `p_retry_after_seconds = -1`; `dead` queda para
 * "agotó max_attempts"). Coherente con tester #19.
 */
export class JobFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobFatalError';
  }
}

export type JobOutcome = 'done' | 'skipped' | 'retried' | 'failed' | 'dead';

export interface RunJobsOptions {
  kinds?: JobKind[];
  /** Jobs por lote (1–200). Default 25. */
  limit?: number;
  /** Presupuesto total de la ejecución en ms. Default 50 000. */
  deadlineMs?: number;
  /** Timeout por job en ms. Default 30 000. */
  jobTimeoutMs?: number;
  /** Identificador del worker (`hostname-pid-random` por defecto). */
  worker?: string;
  /** Inyectable en tests. Por defecto `getServiceClient()`. */
  supabase?: SupabaseClient;
}

export interface KindCounters {
  claimed: number;
  done: number;
  skipped: number;
  retried: number;
  failed: number;
  dead: number;
}

/**
 * Resumen de una ejecución del runner:
 *  - done: completados (incluye `skipped`)
 *  - retried: fallaron y volvieron a `queued` con backoff
 *  - failed: fallo terminal no reintentable (no_handler, JobFatalError)
 *  - dead: agotaron `max_attempts`
 *  - released: reclamados pero devueltos a la cola por deadline (sin ejecutar)
 */
export interface RunJobsSummary {
  worker: string;
  claimed: number;
  done: number;
  skipped: number;
  retried: number;
  failed: number;
  dead: number;
  released: number;
  /** Liberados con el fallback UPDATE porque `fn_release_job` aún no existe (DB-r2). */
  releasedWithoutRpc?: number;
  ms: number;
  byKind: Partial<Record<JobKind, KindCounters>>;
}
