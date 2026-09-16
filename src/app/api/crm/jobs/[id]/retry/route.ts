import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { JobRetryError, resolveJobsPermissions, retryJob } from '@/lib/services/crm/jobsService';

/**
 * POST /api/crm/jobs/[id]/retry — re-encola un job `dead|failed` (FASE-00 §4.1).
 *
 * Auth: sesión + `readOrgBody` (regla 5: un body con otra organización ⇒ 403
 * antes del permiso) + `resolveJobsPermissions(ctx).canRetry` (r5, punto
 * único): super admin, rol 1/2 o rol/cargo con `crm.jobs.view` Y
 * `crm.jobs.retry` resueltos en la BD (`check_user_permission`, fail-closed;
 * un cargo que niega `view` también impide reintentar). Por defecto (`f00_45`)
 * los tienen los roles 1, 2 y 5: el Manager SÍ reintenta (decisión del
 * orquestador autorizada por el dueño, 2026-09-16: reintentar es idempotente
 * y de bajo riesgo, y un cargo puede negarlo con precedencia).
 * El job debe pertenecer a la org de sesión (404 si no).
 * 409 si no está en dead|failed.
 * Idempotente: reutiliza el `dedupe_key` original (o `job:{id}:retry:{attempts}`).
 */
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    if (!(await resolveJobsPermissions(ctx)).canRetry) {
      return NextResponse.json({ success: false, error: 'Requiere permisos crm.jobs.view y crm.jobs.retry' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'id inválido' }, { status: 400 });
    }

    const result = await retryJob(getServiceClient(), ctx.organizationId, id, ctx.userId);
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError || error instanceof JobRetryError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Jobs] retry error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
