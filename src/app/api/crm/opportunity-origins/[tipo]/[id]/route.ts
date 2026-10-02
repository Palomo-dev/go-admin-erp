import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { leerOrigenOportunidad, TIPOS_ORIGEN_OPORTUNIDAD, type TipoOrigenOportunidad } from '@/lib/services/crm/opportunityOriginService';

export async function GET(request: NextRequest, route: { params: Promise<{ tipo: string; id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, new URL(request.url).searchParams, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesCrear], 'GET /api/crm/opportunity-origins');
    const { tipo, id } = await route.params;
    if (!TIPOS_ORIGEN_OPORTUNIDAD.includes(tipo as TipoOrigenOportunidad)) throw new CrmHttpError(400, 'origen_invalido', 'Origen inválido');
    const data = await leerOrigenOportunidad(ctx, tipo as TipoOrigenOportunidad, id);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const response = respuestaErrorCrm(error, 'GET /api/crm/opportunity-origins');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
