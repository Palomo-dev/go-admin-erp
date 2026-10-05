import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { encolarSalud } from '@/lib/services/crm/healthMutationService';

/** El worker consume el evento real; 202 significa encolado, no medición terminada. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    await requireOrgAdminOrPermission(ctx);
    const data = await encolarSalud(ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'POST /api/crm/health/refresh'); }
}
