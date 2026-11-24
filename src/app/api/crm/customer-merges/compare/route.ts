/**
 * GET /api/crm/customer-merges/compare?ids=a,b — los registros de un grupo de
 * duplicados lado a lado, con lo que la fusión movería y lo que se queda en el
 * archivado (Figma CRM 1436:843123). Solo lectura. Permiso
 * `crm.customers.view`; la organización sale de la sesión y cada id se valida
 * contra ella.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { compararClientes } from '@/lib/services/crm/customerMergeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const data = await compararClientes(ctx, ids);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/customer-merges/compare');
  }
}
