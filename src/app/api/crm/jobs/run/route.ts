import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { makeWorkerId, runJobs } from '@/lib/jobs/runner';
import { hasScheduledKinds, runScheduledKinds, type ScheduledRunResult } from '@/lib/jobs/scheduler';
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
 * `x-vercel-cron-schedule` (crons que comparten path en vercel.json) → todos.
 * Un kind desconocido en body/query → 400 `{error:'kinds inválidos', invalid, valid}`
 * (tester r1 F-3: antes un typo drenaba TODA la cola).
 *
 * Kinds programados (`maintenance`, `recording_cleanup`): antes de drenar se
 * ejecuta el productor (`runScheduledKinds`): `maintenance` corre directamente
 * (global) y `recording_cleanup` encola un job por org cuando F3 registre el
 * handler (tester r1 F-1). Su resultado va en `scheduled`.
 *
 * Respuesta 200 siempre que el runner corra (los errores van por job):
 * `{ success, kinds, worker, claimed, done, skipped, retried, failed, dead,
 *    released, ms, byKind, scheduled? }`.
 *
 * `maxDuration = 60` requiere plan Pro (Hobby limita a 10 s) — tester #9.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const TOTAL_BUDGET_MS = 50_000;
/** Presupuesto máximo del productor programado; el resto queda para drenar. */
const SCHEDULED_BUDGET_MS = 20_000;

const VERCEL_SCHEDULE_KINDS: Record<string, JobKind[]> = {
  '*/5 * * * *': ['campaign_batch'],
  '30 8 * * *': ['recording_cleanup', 'maintenance'],
};

type ParsedKinds = { kinds: JobKind[] } | { invalid: string[] } | undefined;

/** `undefined` si no se pidió nada; `{invalid}` si algún valor no es un JobKind. */
function parseKinds(raw: unknown): ParsedKinds {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const values = list.map((k) => String(k).trim()).filter((k) => k.length > 0);
  if (!values.length) return undefined;
  const invalid = values.filter((k) => !isJobKind(k));
  if (invalid.length) return { invalid };
  return { kinds: Array.from(new Set(values.filter(isJobKind))) };
}

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
      { success: false, error: 'kinds inválidos', invalid: parsed.invalid, valid: JOB_KINDS },
      { status: 400 },
    );
  }
  const kinds: JobKind[] | undefined = parsed?.kinds ?? (schedule ? VERCEL_SCHEDULE_KINDS[schedule] : undefined);

  const limitRaw = Number(body.limit ?? request.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : undefined;
  const worker = typeof body.worker === 'string' && body.worker.length <= 100 ? body.worker : makeWorkerId();

  const started = Date.now();
  let scheduled: ScheduledRunResult | undefined;
  if (hasScheduledKinds(kinds)) {
    scheduled = await runScheduledKinds({ kinds: kinds!, budgetMs: SCHEDULED_BUDGET_MS, worker });
  }

  const remaining = Math.max(2_000, TOTAL_BUDGET_MS - (Date.now() - started));
  const summary = await runJobs({ kinds, limit, worker, deadlineMs: remaining });
  return NextResponse.json(
    { success: true, kinds: kinds ?? 'all', ...summary, ...(scheduled ? { scheduled } : {}), ms: Date.now() - started },
    { status: 200 },
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
