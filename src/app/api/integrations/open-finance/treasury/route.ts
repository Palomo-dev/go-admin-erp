// ============================================================
// /api/integrations/open-finance/treasury
// Posicion consolidada de tesoreria multi-banco de la organizacion
// GET - posicion consolidada de la organizacion de la sesion
//
// SEGURIDAD (GO-sec, 2026-09-23): la organizacion salia de `?organizationId=`.
// Ahora sale de la sesion; un `?organizationId=` ajeno responde 403.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

const RUTA = 'open-finance/treasury';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const position = await treasuryService.getConsolidatedPosition(ctx.organizationId);
    return NextResponse.json({ success: true, data: position });
  } catch (error) {
    return routeErrorResponse('Treasury Position GET', error);
  }
});
