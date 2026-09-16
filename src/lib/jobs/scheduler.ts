import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { hasRealJobHandler } from './registry';
import { enqueueJob } from './enqueue';
import { runMaintenance, type MaintenanceResult } from './handlers/maintenance';
import { makeJobLogger } from './runner';
import { runHealthRecalculate, type HealthRecalcResult } from './scheduled/healthRecalculate';
import { runRenewalsSync, type RenewalsSyncResult } from './scheduled/renewalsSync';
import { isScheduledTask, type ScheduledKind } from './scheduledOrgs';
import { loadOrgTimezones, orgDay } from './orgTimezone';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

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
 *  - `recording_cleanup` → POR ORG (F3 registra el handler real). r3 (QA r2
 *    N-1/N-6): se encola SOLO para las orgs con `comm_settings.is_active` que
 *    además tienen grabaciones `ready` con `retention_until` vencido (antes
 *    eran las 84 activas y 83 jobs/día devolvían `deleted:0`). Dedupe
 *    `recording_cleanup:{yyyy-mm-dd}` con el DÍA DE LA ORGANIZACIÓN
 *    (`organizations.timezone`, N-7): el productor corre una vez al día, así
 *    que sigue siendo un singleton diario por org. El bucle de encolado tiene
 *    presupuesto y `signal`: al agotarse devuelve `truncated:true` y
 *    `pending_org_ids`. r4 (T-5): esa lista NO se persiste; el día siguiente
 *    se vuelve a seleccionar por grabaciones vencidas en el mismo orden (id
 *    asc), así que un truncado recurrente dejaría fuera a las mismas orgs.
 *    Con presupuesto 0 o señal abortada no se consulta nada (T-3). Mientras el handler sea
 *    el placeholder de F0 NO se encola nada; `reason = 'handler_not_registered'`.
 *
 *  - `health_recalculate` y `renewals_sync` (F11) → tareas EN PROCESO por
 *    organización con CRM activo (`organization_modules`). NO son
 *    `outbound_jobs.kind` (el CHECK real no los admite y F11 no lleva
 *    migraciones): son `ScheduledTask` (`scheduledOrgs.ts`) y nunca se
 *    encolan. Cada una devuelve conteos y errores por organización; una org
 *    que falla no detiene a las demás. Idempotentes: si pg_cron y Vercel
 *    coinciden, la segunda pasada no escribe snapshots ni renovaciones nuevas.
 *
 * Solo se activa cuando la petición trae explícitamente esos kinds
 * (`?kind=`, body.kinds o `x-vercel-cron-schedule`); el drenaje sin kinds
 * (cada minuto) no lo dispara.
 */
export const SCHEDULED_KINDS: readonly ScheduledKind[] = ['maintenance', 'recording_cleanup', 'health_recalculate', 'renewals_sync'];

export interface RecordingCleanupEnqueueResult {
  enqueued: number;
  /** Orgs candidatas (activas Y con grabaciones vencidas). */
  orgs: number;
  ms?: number;
  reason?: string;
  error?: string;
  /** El presupuesto/`signal` cortó el bucle antes de encolar todas las orgs. */
  truncated?: boolean;
  pending_org_ids?: number[];
}

/**
 * Tarea F11 no completada: error real o, con `reason: 'budget_exhausted'`, ni
 * siquiera arrancó porque el total ya estaba agotado (r4, tester r3 T-4).
 */
export type TaskFailure = { ok: false; ms: number; error: string; reason?: 'budget_exhausted' };

export interface ScheduledRunResult {
  maintenance?: { ok: true; ms: number; result: MaintenanceResult } | { ok: false; ms: number; error: string };
  recording_cleanup?: RecordingCleanupEnqueueResult;
  health_recalculate?: { ok: true; ms: number; result: HealthRecalcResult } | TaskFailure;
  renewals_sync?: { ok: true; ms: number; result: RenewalsSyncResult } | TaskFailure;
}

export interface RunScheduledOptions {
  kinds: readonly ScheduledKind[];
  /** Presupuesto en ms (se aborta el mantenimiento al agotarse). */
  budgetMs: number;
  /**
   * F11 r2: presupuesto PROPIO de cada tarea en proceso (`health_recalculate`,
   * `renewals_sync`), independiente del de `maintenance`. Sin él, cada tarea
   * recibe `budgetMs / nº de tareas` (comportamiento r1).
   */
  taskBudgetMs?: number;
  /**
   * r3 (N-1): presupuesto TOTAL del productor. Cada paso recibe como máximo lo
   * que quede (`maintenance` ≤ `budgetMs`, encolado ≤ `budgetMs`, tareas ≤
   * `taskBudgetMs`); al agotarse, los pasos siguientes se abortan por `signal`
   * en vez de comerse el `maxDuration` de la función.
   */
  totalBudgetMs?: number;
  worker: string;
  supabase?: SupabaseClient;
  now?: Date;
}

/** Hasta cuántas filas de `call_recordings` vencidas se leen para descubrir orgs con trabajo. */
const EXPIRED_RECORDINGS_SCAN_LIMIT = 5000;

function errorMessage(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 2000);
}

export function hasScheduledKinds(kinds: readonly ScheduledKind[] | undefined): boolean {
  return !!kinds && kinds.some((k) => SCHEDULED_KINDS.includes(k));
}

/** Ejecuta una tarea en proceso con presupuesto (aborto cooperativo) y sin lanzar. */
async function runTimed<T>(
  budgetMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<{ ok: true; ms: number; result: T } | { ok: false; ms: number; error: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, budgetMs));
  try {
    const result = await run(controller.signal);
    return { ok: true, ms: Date.now() - started, result };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: errorMessage(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function runScheduledKinds(opts: RunScheduledOptions): Promise<ScheduledRunResult> {
  const out: ScheduledRunResult = {};
  if (!hasScheduledKinds(opts.kinds)) return out;
  const log = makeJobLogger({ worker: opts.worker, src: 'jobs.scheduler' });
  const startedAll = Date.now();
  const totalBudgetMs = opts.totalBudgetMs ?? Number.POSITIVE_INFINITY;
  /** Presupuesto que queda del total, acotado por el del paso (`cap`). */
  const remainingFor = (cap: number) => Math.min(cap, totalBudgetMs - (Date.now() - startedAll));

  let sb: SupabaseClient;
  try {
    sb = opts.supabase ?? getServiceClient();
  } catch (err) {
    log.error('scheduler_no_client', { error: errorMessage(err) });
    return out;
  }

  if (opts.kinds.includes('maintenance')) {
    // r5 (N-3): con el total ya agotado, `maintenance` no arranca (antes recibía
    // 250 ms igualmente). Con presupuesto positivo, el mínimo de 250 ms se mantiene.
    const remaining = remainingFor(opts.budgetMs);
    if (remaining <= 0) {
      out.maintenance = { ok: false, ms: 0, error: 'budget_exhausted' };
      log.warn('maintenance_skipped', { reason: 'budget_exhausted' });
    } else {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(250, remaining));
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
  }

  if (opts.kinds.includes('recording_cleanup')) {
    if (!hasRealJobHandler('recording_cleanup')) {
      out.recording_cleanup = { enqueued: 0, orgs: 0, reason: 'handler_not_registered' };
    } else {
      const budget = remainingFor(opts.budgetMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(0, budget));
      try {
        out.recording_cleanup = await enqueueRecordingCleanup(sb, opts.now, log, { signal: controller.signal, budgetMs: budget });
      } finally {
        clearTimeout(timer);
      }
      if (out.recording_cleanup.truncated) log.warn('recording_cleanup_enqueue_truncated', { ...out.recording_cleanup });
    }
  }

  // F11: tareas en proceso con presupuesto propio (r2) o, si no se indica, a partes iguales.
  const tasks = opts.kinds.filter(isScheduledTask);
  if (tasks.length > 0) {
    // r3: nunca más de lo que quede del total. r4 (T-4): sin mínimo de 1 s por
    // tarea; con el total agotado la tarea NO arranca (`reason: 'budget_exhausted'`)
    // y el presupuesto se recalcula ANTES de cada tarea, no una vez para todas.
    const taskCap = opts.taskBudgetMs ?? Math.floor(opts.budgetMs / tasks.length);
    const budgetFor = () => Math.max(0, remainingFor(taskCap));
    const exhaustedTask = (): TaskFailure => ({ ok: false, ms: 0, error: 'budget_exhausted', reason: 'budget_exhausted' });
    const now = opts.now ?? new Date();
    if (tasks.includes('health_recalculate')) {
      const perTask = budgetFor();
      if (perTask <= 0) {
        out.health_recalculate = exhaustedTask();
        log.warn('health_recalculate_skipped', { reason: 'budget_exhausted' });
      } else {
        // La tarea mide su propio presupuesto (reloj real) además de la señal: al agotarse
        // devuelve `pending_org_ids` en vez de cortar a mitad de una organización.
        out.health_recalculate = await runTimed(perTask, (signal) => runHealthRecalculate(sb, now, log, signal, { budgetMs: perTask }));
        if (!out.health_recalculate.ok) log.error('health_recalculate_failed', { error: out.health_recalculate.error });
      }
    }
    if (tasks.includes('renewals_sync')) {
      const perTask = budgetFor();
      if (perTask <= 0) {
        out.renewals_sync = exhaustedTask();
        log.warn('renewals_sync_skipped', { reason: 'budget_exhausted' });
      } else {
        out.renewals_sync = await runTimed(perTask, (signal) => runRenewalsSync(sb, now, log, signal));
        if (!out.renewals_sync.ok) log.error('renewals_sync_failed', { error: out.renewals_sync.error });
      }
    }
  }

  return out;
}

export interface EnqueueBudget {
  signal: AbortSignal;
  budgetMs: number;
}

/**
 * Orgs con trabajo real: activas en `comm_settings` ∩ con alguna grabación
 * `ready` cuyo `retention_until` (tipo `date`) es anterior al día UTC del
 * productor. El día UTC es un SUPERCONJUNTO del día de cualquier org (a las
 * 08:30 UTC el día local va de UTC−1 a UTC+0), así que ninguna org con
 * trabajo se queda fuera; el handler aplica el corte exacto con la zona de la
 * org. `EXPIRED_RECORDINGS_SCAN_LIMIT` acota la lectura: el handler borra 200
 * por día y `remaining` cubre el resto.
 */
async function selectOrgsWithExpiredRecordings(sb: SupabaseClient, now: Date): Promise<{ orgIds: number[]; error?: string }> {
  const utcDay = orgDay('UTC', now);
  const [active, expired] = await Promise.all([
    sb.from('comm_settings').select('organization_id').eq('is_active', true).limit(1000),
    sb.from('call_recordings').select('organization_id').eq('status', 'ready').lt('retention_until', utcDay).limit(EXPIRED_RECORDINGS_SCAN_LIMIT),
  ]);
  if (active.error) return { orgIds: [], error: `comm_settings: ${active.error.message}` };
  if (expired.error) return { orgIds: [], error: `call_recordings: ${expired.error.message}` };
  const toIds = (rows: unknown) =>
    new Set(((rows ?? []) as { organization_id: number }[]).map((r) => r.organization_id).filter((id) => Number.isInteger(id) && id > 0));
  const activeIds = toIds(active.data);
  const orgIds = Array.from(toIds(expired.data)).filter((id) => activeIds.has(id)).sort((a, b) => a - b);
  return { orgIds };
}

export async function enqueueRecordingCleanup(
  sb: SupabaseClient,
  now: Date | undefined,
  log: ReturnType<typeof makeJobLogger>,
  budget: EnqueueBudget,
): Promise<RecordingCleanupEnqueueResult> {
  const started = Date.now();
  const deadlineAt = started + Math.max(0, budget.budgetMs);
  const exhausted = () => budget.signal.aborted || Date.now() >= deadlineAt;

  // r4 (tester r3 T-3): con el presupuesto agotado (o la señal ya abortada) no
  // se hace NINGUNA consulta; antes se gastaban 3 round-trips para nada.
  if (exhausted()) return { enqueued: 0, orgs: 0, ms: Date.now() - started, truncated: true, reason: 'budget_exhausted' };

  const selected = await selectOrgsWithExpiredRecordings(sb, now ?? new Date());
  if (selected.error) {
    log.error('recording_cleanup_orgs_failed', { error: selected.error });
    return { enqueued: 0, orgs: 0, ms: Date.now() - started, error: selected.error };
  }
  const orgIds = selected.orgIds;
  if (orgIds.length === 0) return { enqueued: 0, orgs: 0, ms: Date.now() - started, reason: 'no_expired_recordings' };
  if (exhausted()) return { enqueued: 0, orgs: orgIds.length, ms: Date.now() - started, truncated: true, pending_org_ids: orgIds, reason: 'budget_exhausted' };

  let timezones = new Map<number, string>();
  try {
    timezones = await loadOrgTimezones(orgIds, sb);
  } catch (err) {
    log.warn('recording_cleanup_timezones_failed', { error: errorMessage(err) });
  }

  let enqueued = 0;
  const pending: number[] = [];
  for (let i = 0; i < orgIds.length; i++) {
    const organizationId = orgIds[i];
    if (exhausted()) {
      pending.push(...orgIds.slice(i));
      break;
    }
    // Día calendario de la ORGANIZACIÓN (N-7): clave y `scheduled_for` coinciden con el `cutoff` del handler.
    const day = orgDay(timezones.get(organizationId) ?? DEFAULT_TIMEZONE, now);
    try {
      await enqueueJob({
        organizationId,
        kind: 'recording_cleanup',
        payload: { scheduled_for: day },
        dedupeKey: `recording_cleanup:${day}`,
        maxAttempts: 3,
        supabase: sb,
      });
      enqueued += 1;
    } catch (err) {
      log.warn('recording_cleanup_enqueue_failed', { org_id: organizationId, error: errorMessage(err) });
    }
  }
  const result: RecordingCleanupEnqueueResult = { enqueued, orgs: orgIds.length, ms: Date.now() - started };
  if (pending.length > 0) {
    result.truncated = true;
    result.pending_org_ids = pending;
  }
  return result;
}
