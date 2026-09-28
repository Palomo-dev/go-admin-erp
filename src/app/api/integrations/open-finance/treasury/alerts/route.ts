// ============================================================
// /api/integrations/open-finance/treasury/alerts
// Alertas de tesoreria de la organizacion
// GET - alertas de la organizacion de la sesion
//
// SEGURIDAD (GO-sec, 2026-09-23): organizacion de la sesion; un
// `?organizationId=` ajeno responde 403 y queda registrado.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

const RUTA = 'open-finance/treasury/alerts';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const alerts = await treasuryService.getTreasuryAlerts(ctx.organizationId);
    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    return routeErrorResponse('Treasury Alerts GET', error);
  }
});
