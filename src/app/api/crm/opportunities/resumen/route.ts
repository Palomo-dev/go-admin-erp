import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { filtrosDesdeQuery, monedaBaseDe, periodoDesdeQuery, resumenOportunidades } from '@/lib/services/crm/oportunidadesLecturaService';

/**
 * GET /api/crm/opportunities/resumen — KPI y conteos de la lista de
 * Oportunidades (CRM ola 3B, plan §4.4; Figma 773:23160).
 *
 * Mismos filtros que `GET /api/crm/opportunities` salvo `status`: los conteos
 * alimentan las pestañas Abiertas · Ganadas · Perdidas · Todas.
 * Periodo en el día de la organización (lo calcula la interfaz con
 * `dateDisplay`): `period_from`/`period_to` (date, «cierran este mes»),
 * `since` (instante de hace 90 días, tasa de cierre), `today` (tasa vigente).
 *
 * 200 { conteos, abiertas[{moneda,monto,ponderado,cantidad}], por_etapa,
 *       cierran_periodo, ganadas_90, perdidas_90, tasas[], truncado, base }
 * La moneda base la resuelve el servidor; la conversión la hace `KpiMoneda`
 * con las tasas de la organización (nunca se inventa una tasa).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities/resumen');
    const sp = new URL(request.url).searchParams;
    const base = await monedaBaseDe(ctx);
    const data = await resumenOportunidades(ctx, filtrosDesdeQuery(sp), { ...periodoDesdeQuery(sp), base });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities/resumen');
  }
}
