import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { makeWorkerId, runJobs } from '@/lib/jobs/runner';
import { hasScheduledKinds, runScheduledKinds, type ScheduledRunResult } from '@/lib/jobs/scheduler';
import { isScheduledTask, SCHEDULED_TASKS, splitScheduledKinds, type ScheduledKind } from '@/lib/jobs/scheduledOrgs';
import { VERCEL_SCHEDULE_KINDS } from '@/lib/jobs/schedule';
import { JOB_KINDS, isJobKind, type JobKind } from '@/lib/jobs/types';

/**
 * GET|POST /api/crm/jobs/run — drena `outbound_jobs` (FASE-00 §4.1, D3).
 *
 * Auth (fail-closed, `verifyCronSecret` de SEC): `Authorization: Bearer ${CRON_SECRET}`
 * o `x-cron-secret: ${CRON_SECRET}`; sin header, sin variable o valor
 * distinto → 401. NO se acepta `?token=`.
 * Invocadores: pg_cron/pg_net (`fn_crm_cron_post`, Bearer), Vercel Cron (envía
 * el Bearer automáticamente cuando `CRON_SECRET` existe en el proyecto) y el
 * script `scripts/crm-jobs-smoke.ts`.
 *
 * Selección de kinds (prioridad): body.kinds → ?kind=a,b → header
 * `x-vercel-cron-schedule` (crons que comparten path en vercel.json; tabla en
 * `src/lib/jobs/schedule.ts`, guardarraíl 18) → todos.
 * Un kind desconocido en body/query → 400 `{error:'kinds inválidos', invalid, valid}`
 * (tester r1 F-3: antes un typo drenaba TODA la cola).
 *
 * Kinds programados (`maintenance`, `recording_cleanup`): antes de drenar se
 * ejecuta el productor (`runScheduledKinds`): `maintenance` corre directamente
 * (global) y `recording_cleanup` encola un job por org cuando F3 registre el
 * handler (tester r1 F-1). Su resultado va en `scheduled`.
 *
 * Tareas en proceso F11 (`health_recalculate`, `renewals_sync`): se aceptan
 * en `?kind=`/body.kinds y en el cron diario, pero NO son `outbound_jobs.kind`
 * (`ScheduledTask`, ver `scheduledOrgs.ts`): nunca llegan al drenador. Si
 * solo se piden tareas, no se drena nada (`claimed: 0`). La respuesta separa
 * `kinds` (cola) de `tasks` (en proceso).
 *
 * Presupuesto (r3, QA r2 N-1): el productor recibe `totalBudgetMs` y, si al
 * volver quedan menos de `MIN_DRAIN_MS`, NO se drena (`claimed:0`,
 * `reason:'budget_exhausted'`): los jobs recién encolados los recoge el
 * drenaje total de `*\/2`. Antes `Math.max(2_000, …)` entraba a drenar aunque
 * el límite ya estuviera superado y Vercel mataba la función a los 60 s.
 *
 * Respuesta 200 siempre que el runner corra (los errores van por job):
 * `{ success, kinds, tasks?, worker, claimed, done, skipped, retried, failed,
 *    dead, released, ms, byKind, scheduled?, reason? }`.
 *
 * `maxDuration = 60` requiere plan Pro (Hobby limita a 10 s) — tester #9.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const TOTAL_BUDGET_MS = 50_000;
/** Por debajo de esto no merece la pena reclamar un lote (el runner exige 1,5 s por job). */
const MIN_DRAIN_MS = 2_000;
/** Presupuesto máximo de `maintenance` (global) y del encolado de `recording_cleanup`. */
const SCHEDULED_BUDGET_MS = 20_000;
/**
 * F11 r2: presupuesto PROPIO de cada tarea en proceso (health_recalculate,
 * renewals_sync). Cuenta honesta del cron diario (08:30), medida en BD por el
 * tester r2: maintenance + tareas ≈ 29 s, encolado 7–10 s con 84 orgs (r3 lo
 * reduce a las orgs con grabaciones vencidas: hoy 1). Tope del productor
 * `PRODUCER_BUDGET_MS = TOTAL − MIN_DRAIN` (48 s); cada paso recibe como
 * máximo lo que quede. `maxDuration = 60`. Con ~70 ms por ida y vuelta
 * iad1↔us-west-1 y ~5 llamadas por organización caben ~30–40 orgs por pasada;
 * las que no quepan salen en `pending_org_ids` (solo en el log y en la
 * respuesta: NO se persisten; r4, tester r3 T-5). Al día siguiente el productor
 * vuelve a seleccionar por grabaciones vencidas, en el mismo orden (id asc):
 * si el truncado se repitiera a diario, las mismas orgs quedarían fuera. Hoy
 * (1 org con grabaciones, ~600 caben en 48 s) no ocurre; la rotación o la
 * persistencia queda para F0-JOBS r5 (N-1b).
 */
const TASK_BUDGET_MS = 12_000;
const PRODUCER_BUDGET_MS = TOTAL_BUDGET_MS - MIN_DRAIN_MS;

/**
 * `worker` del body (N-10): solo un identificador simple; cualquier otra cosa
 * (espacios, saltos de línea, comillas) se ignora y se genera uno. Va
 * parametrizado a las RPC, pero acaba en `locked_by` y en los logs.
 */
const WORKER_ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;

type ParsedKinds = { kinds: ScheduledKind[] } | { invalid: string[] } | undefined;

const isRequestable = (k: string): k is ScheduledKind => isJobKind(k) || isScheduledTask(k);

/** `undefined` si no se pidió nada; `{invalid}` si algún valor no es JobKind ni ScheduledTask. */
function parseKinds(raw: unknown): ParsedKinds {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const values = list.map((k) => String(k).trim()).filter((k) => k.length > 0);
  if (!values.length) return undefined;
  const invalid = values.filter((k) => !isRequestable(k));
  if (invalid.length) return { invalid };
  return { kinds: Array.from(new Set(values.filter(isRequestable))) };
}

const EMPTY_SUMMARY = { claimed: 0, done: 0, skipped: 0, retried: 0, failed: 0, dead: 0, released: 0, ms: 0, byKind: {} as Record<string, unknown> };

async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    verifyCronSecret(request); // lanza WebhookError(401) si falta secreto o no coincide
  } catch (err) {
    const status = err instanceof WebhookError ? err.statusCode : 401;
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status });
  }

  let body: { kinds?: unknown; limit?: unknown; worker?: unknown } = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const schedule = request.headers.get('x-vercel-cron-schedule');
  const parsed = parseKinds(body.kinds) ?? parseKinds(request.nextUrl.searchParams.get('kind'));
  if (parsed && 'invalid' in parsed) {
    return NextResponse.json(
      { success: false, error: 'kinds inválidos', invalid: parsed.invalid, valid: [...JOB_KINDS, ...SCHEDULED_TASKS] },
      { status: 400 },
    );
  }
  const requested: ScheduledKind[] | undefined = parsed?.kinds ?? (schedule && VERCEL_SCHEDULE_KINDS[schedule] ? [...VERCEL_SCHEDULE_KINDS[schedule]] : undefined);
  const { jobKinds, tasks } = splitScheduledKinds(requested);
  // Sin petición explícita se drena todo; con petición, solo los kinds de cola (nunca las tareas).
  const kinds: JobKind[] | undefined = requested ? jobKinds : undefined;

  const limitRaw = Number(body.limit ?? request.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : undefined;
  const worker = typeof body.worker === 'string' && WORKER_ID_RE.test(body.worker) ? body.worker : makeWorkerId();

  const started = Date.now();
  let scheduled: ScheduledRunResult | undefined;
  if (hasScheduledKinds(requested)) {
    scheduled = await runScheduledKinds({
      kinds: requested!,
      budgetMs: SCHEDULED_BUDGET_MS,
      taskBudgetMs: TASK_BUDGET_MS,
      totalBudgetMs: PRODUCER_BUDGET_MS,
      worker,
    });
  }

  const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
  let summary;
  if (requested && kinds!.length === 0) {
    // Solo tareas en proceso pedidas ⇒ no hay nada que drenar (y `kinds: []` drenaría TODO).
    summary = { worker, ...EMPTY_SUMMARY };
  } else if (remaining < MIN_DRAIN_MS) {
    // El productor agotó el presupuesto: no se reclama nada (un claim sin margen
    // acabaría en `released` o, peor, en `running` hasta el reclaim de 10 min).
    summary = { worker, ...EMPTY_SUMMARY, reason: 'budget_exhausted' as const };
  } else {
    summary = await runJobs({ kinds, limit, worker, deadlineMs: remaining });
  }
  return NextResponse.json(
    {
      success: true,
      kinds: kinds ?? 'all',
      ...(tasks.length ? { tasks } : {}),
      ...summary,
      ...(scheduled ? { scheduled } : {}),
      ms: Date.now() - started,
    },
    { status: 200 },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
