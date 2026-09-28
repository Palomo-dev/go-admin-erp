// ============================================================
// /api/integrations/open-finance/treasury/projection
// Proyeccion de flujo de caja a N dias de la organizacion
// GET - (query: ?days=90)
//
// SEGURIDAD (GO-sec, 2026-09-23): organizacion de la sesion; un
// `?organizationId=` ajeno responde 403 y queda registrado.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

const RUTA = 'open-finance/treasury/projection';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const daysParam = new URL(request.url).searchParams.get('days');
    const days = daysParam ? Number(daysParam) : 90;
    if (!Number.isInteger(days) || days <= 0 || days > 365) {
      return NextResponse.json({ error: 'days debe ser un numero entre 1 y 365' }, { status: 400 });
    }

    const projection = await treasuryService.getCashFlowProjection(ctx.organizationId, days);
    return NextResponse.json({ success: true, data: projection });
  } catch (error) {
    return routeErrorResponse('Treasury Projection GET', error);
  }
});
