import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { canRetryJobs, JobRetryError, retryJob } from '@/lib/services/crm/jobsService';

/**
 * POST /api/crm/jobs/[id]/retry — re-encola un job `dead|failed` (FASE-00 §4.1).
 *
 * Auth: sesión + `canRetryJobs` (r4): super admin, rol 1/2 o cargo/rol con
 * `admin.full_access` resuelto en la BD (`hasOrgAdminOrPermission` sobre
 * `check_user_permission`, fail-closed). Manager (5) NO reintenta.
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
    if (!(await canRetryJobs(ctx))) {
      return NextResponse.json({ success: false, error: 'Requiere rol administrador' }, { status: 403 });
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
