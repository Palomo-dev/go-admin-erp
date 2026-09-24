// ============================================================
// /api/integrations/open-finance/treasury/concentration
// Concentracion de pagos por proveedor de la organizacion
// GET - (query: ?dateFrom=xxx&dateTo=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): organizacion de la sesion; un
// `?organizationId=` ajeno responde 403 y queda registrado.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

const RUTA = 'open-finance/treasury/concentration';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: 'dateFrom y dateTo son requeridos' }, { status: 400 });
    }

    const concentration = await treasuryService.getPaymentConcentration(ctx.organizationId, dateFrom, dateTo);
    return NextResponse.json({ success: true, data: concentration });
  } catch (error) {
    return routeErrorResponse('Treasury Concentration GET', error);
  }
});
