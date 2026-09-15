import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { recalculateOrgHealth } from '@/lib/jobs/scheduled/healthRecalculate';

/**
 * POST /api/crm/health/refresh — botón «Recalcular» de /app/crm/salud (F11 r2).
 *
 * Misma pasada que el cron (`recalculateOrgHealth`: config sobre la RPC,
 * snapshot solo si cambió el score o venció el intervalo, `customers.health_score`
 * solo si cambió) pero con la SESIÓN del usuario (RLS) y solo para su
 * organización. Regla 5: la organización sale de la sesión; un body con otra
 * → 403 y se registra. El cron con secreto vive en `health/recalculate`.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json().catch(() => ({}));
    const foreign = foreignOrganizationInBody((body as { organization_id?: unknown } | null)?.organization_id, ctx.organizationId);
    if (foreign !== null) {
      console.warn('[health/refresh] POST con organization_id ajeno en el body', { session: ctx.organizationId, body: foreign });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }
    const result = await recalculateOrgHealth(ctx.organizationId, ctx.supabase, new Date());
    return NextResponse.json({ success: true, data: result }, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Health] refresh error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
