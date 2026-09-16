import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { makeJobLogger, makeWorkerId } from '@/lib/jobs/runner';
import { runRenewalsSync, type RenewalsSyncResult } from '@/lib/jobs/scheduled/renewalsSync';
import { getUpcomingRenewalsServer, syncRenewalsForOrg } from '@/lib/services/crm/renewalService';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

/**
 * /api/crm/renewals/sync (FASE-11).
 *
 * POST — cron. Misma tarea en proceso que el cron diario de `/api/crm/jobs/run`
 * (`renewals_sync`): una renovación por contrato ganado con ciclo, hitos como
 * tareas, idempotente. Auth fail-closed (`verifyCronSecret`); body opcional
 * `{ organization_id }` limita la pasada (solo con el secreto).
 *
 * GET — próximas renovaciones de la organización DE LA SESIÓN
 * (`getServerOrgContext`). `?days=` (1..730). Cualquier `organization_id` en
 * la query se ignora: la organización nunca viene del cliente.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const BUDGET_MS = 50_000;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    verifyCronSecret(request);
  } catch (err) {
    const status = err instanceof WebhookError ? err.statusCode : 401;
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status });
  }

  let organizationId: number | undefined;
  try {
    const body = await request.json();
    const raw = Number(body?.organization_id);
    if (Number.isInteger(raw) && raw > 0) organizationId = raw;
  } catch {
    // sin body
  }

  const log = makeJobLogger({ worker: makeWorkerId(), src: 'crm.renewals.sync' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUDGET_MS);
  try {
    const sb = getServiceClient();
    const now = new Date();
    let result: RenewalsSyncResult;
    if (organizationId) {
      const { data: org } = await sb.from('organizations').select('timezone').eq('id', organizationId).maybeSingle();
      const tz = (org as { timezone?: string | null } | null)?.timezone || DEFAULT_TIMEZONE;
      const one = await syncRenewalsForOrg(organizationId, sb, { now, timezone: tz });
      result = { orgs: 1, processed: 1, created: one.created, updated: one.updated, errors: one.errors.length, aborted: false, by_org: [{ ...one, timezone: tz }] };
    } else {
      result = await runRenewalsSync(sb, now, log, controller.signal);
    }
    return NextResponse.json(
      { success: true, data: { ...result, execution_time_ms: Date.now() - startTime, date: now.toISOString() } },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    log.error('renewals_sync_route_failed', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const raw = parseInt(request.nextUrl.searchParams.get('days') || '90', 10);
    const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 730) : 90;
    const renewals = await getUpcomingRenewalsServer(ctx.organizationId, ctx.supabase, days);
    return NextResponse.json(
      { success: true, data: renewals, count: renewals.length },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Renewals] Error en GET:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
