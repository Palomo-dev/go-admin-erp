import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getOpportunityFinance360 } from '@/lib/services/crm/crmFinanceService';

/**
 * GET /api/crm/opportunities/[id]/finance — resumen financiero de la
 * oportunidad (CRM ola 1, «Conexiones» del detalle, plan §4.6).
 *
 * Reutiliza `crmFinanceService.getOpportunityFinance360` (facturas, pagos,
 * comisiones, cotizaciones…), el mismo que `GET /api/crm/finance/opportunity/[id]`,
 * con `crm.opportunities.view` y 404 si la oportunidad no es de la organización.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities/[id]/finance');
    const { data: opp, error } = await ctx.supabase.from('opportunities').select('id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (error) throw error;
    if (!opp) throw new CrmHttpError(404, 'oportunidad_no_encontrada', 'Oportunidad no encontrada');
    const data = await getOpportunityFinance360(ctx.organizationId, id, ctx.supabase);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities/[id]/finance');
  }
}
