// ============================================================
// /api/integrations/open-finance/refresh-balances
// Refresca saldos de las cuentas vinculadas de la organizacion de la sesion
// POST - sin body obligatorio (un `organizationId` distinto al de la sesion → 403)
//
// SEGURIDAD (GO-sec, 2026-09-23): la organizacion salia del body. Ahora sale
// de la sesion (`withOrg`), el body ajeno responde 403 (`readOrgBody`) y exige
// `finance.create`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { balanceService } from '@/lib/services/integrations/openFinance/balanceService';

const RUTA = 'open-finance/refresh-balances';

export const POST = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const stats = await balanceService.refreshAllBalances(ctx.organizationId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    return routeErrorResponse('Open Finance Refresh Balances POST', error);
  }
});
