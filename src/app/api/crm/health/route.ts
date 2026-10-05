import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { readHealthDashboard } from '@/lib/services/crm/healthReadService';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, new URL(request.url).searchParams, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'GET /api/crm/health');
    return NextResponse.json({ success: true, data: await readHealthDashboard(ctx) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET /api/crm/health'); }
}
