import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { makeJobLogger, makeWorkerId } from '@/lib/jobs/runner';
import { recalculateOrgHealth, runHealthRecalculate, type HealthRecalcResult } from '@/lib/jobs/scheduled/healthRecalculate';

/**
 * POST|GET /api/crm/health/recalculate — cron del health score (FASE-11).
 *
 * Misma tarea en proceso que ejecuta el cron diario de `/api/crm/jobs/run`
 * (`health_recalculate`): recorre las organizaciones con CRM activo, respeta
 * `health_score_configs.is_active` / `refresh_interval_hours` y escribe
 * `health_score_snapshots` solo si cambió el score o venció el intervalo.
 *
 * Auth fail-closed (`verifyCronSecret`): `Authorization: Bearer ${CRON_SECRET}`
 * o `x-cron-secret`; sin variable o sin coincidencia → 401. Nunca `?token=`.
 * Body opcional `{ organization_id }` limita la pasada a una organización
 * (solo con el secreto: aquí no hay sesión de usuario). El botón «Recalcular»
 * de la UI usa `POST /api/crm/health/refresh` (sesión, RLS, regla 5).
 * r2: la pasada completa lleva presupuesto propio (`BUDGET_MS`) y devuelve
 * `pending_org_ids` si no cupo todo.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 50_000;

async function handle(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  try {
    verifyCronSecret(request);
  } catch (err) {
    const status = err instanceof WebhookError ? err.statusCode : 401;
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status });
  }

  let organizationId: number | undefined;
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const raw = Number(body?.organization_id);
      if (Number.isInteger(raw) && raw > 0) organizationId = raw;
    } catch {
      // sin body
    }
  }

  const log = makeJobLogger({ worker: makeWorkerId(), src: 'crm.health.recalculate' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUDGET_MS);
  try {
    const sb = getServiceClient();
    const now = new Date();
    let result: HealthRecalcResult;
    if (organizationId) {
      const one = await recalculateOrgHealth(organizationId, sb, now);
      result = { orgs: 1, processed: 1, snapshots_written: one.snapshots_written, customers_updated: one.customers_updated, errors: one.error ? 1 : 0, aborted: false, pending_org_ids: [], budget_ms: null, elapsed_ms: one.ms, by_org: [one] };
    } else {
      result = await runHealthRecalculate(sb, now, log, controller.signal, { budgetMs: BUDGET_MS });
    }
    return NextResponse.json(
      { success: true, data: { ...result, execution_time_ms: Date.now() - startTime, date: now.toISOString() } },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    log.error('health_recalculate_route_failed', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

/** Alias para crons que usan GET. */
export async function GET(request: NextRequest) {
  return handle(request);
}
