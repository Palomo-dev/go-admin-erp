/**
 * GET /api/crm/territories/counts — cuántos clientes caen en cada territorio
 * activo, cuántos en varios y cuántos en ninguno, con el MISMO motor que la
 * asignación automática (`territoryCountsService`). Permiso
 * `crm.customers.view`; la organización sale de la sesión.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { contarTerritorios } from '@/lib/services/crm/territoryCountsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const data = await contarTerritorios(ctx);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/territories/counts');
  }
}
