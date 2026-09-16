import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getJobStats, listJobs, listRecentFailed, parseKind, parseStatus, resolveJobsPermissions } from '@/lib/services/crm/jobsService';

/**
 * GET /api/crm/jobs — observabilidad de la cola de la org (FASE-00 §4.1).
 *
 * Auth: sesión (`getServerOrgContext(request)`: header `X-Organization-Id` o
 * cookie `goadmin_org_id`); org SIEMPRE de sesión. Permiso (r5): super admin,
 * rol 1/2 o rol/cargo con `crm.jobs.view` resuelto en la BD
 * (`check_user_permission`, fail-closed); 403 en otro caso. Los dos permisos
 * (`crm.jobs.view`, `crm.jobs.retry`) se resuelven UNA vez por petición con
 * `resolveJobsPermissions` (orden `[view, retry]`; `view` en `false` corta con una sola RPC).
 * Query: `?status=queued|running|done|failed|dead&kind=&page=&pageSize=`
 * Respuesta: `{ success, items, total, page, pageSize, stats, recentFailed, canRetry }`
 * (`payload_preview` redactado: solo `*_id`, `kind`, `campaign_id`, `event_type`…).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const permissions = await resolveJobsPermissions(ctx);
    if (!permissions.canView) {
      return NextResponse.json({ success: false, error: 'Requiere permiso crm.jobs.view' }, { status: 403 });
    }
    const sp = request.nextUrl.searchParams;
    const status = parseStatus(sp.get('status'));
    const kind = parseKind(sp.get('kind'));
    const page = Number(sp.get('page') ?? 1);
    const pageSize = Number(sp.get('pageSize') ?? 50);

    const [list, stats, recentFailed] = await Promise.all([
      listJobs(ctx.supabase, ctx.organizationId, {
        status,
        kind,
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      }),
      getJobStats(ctx.supabase, ctx.organizationId),
      listRecentFailed(ctx.supabase, ctx.organizationId, 50),
    ]);

    return NextResponse.json({ success: true, ...list, stats, recentFailed, canRetry: permissions.canRetry }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Jobs] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
