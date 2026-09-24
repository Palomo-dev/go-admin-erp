// ============================================================
// /api/integrations/open-finance/validate-balance
// Valida el saldo real del banco contra el extracto de una conciliacion
// POST - body: { reconciliationId }
//
// SEGURIDAD (GO-sec, 2026-09-23): aceptaba cualquier conciliacion. Ahora
// tiene que ser de la organizacion de la sesion (404) y la organizacion ajena
// en el body responde 403.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { balanceService } from '@/lib/services/integrations/openFinance/balanceService';
import { conciliacionDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/validate-balance';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ reconciliationId?: number }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { reconciliationId } = body;
    if (!reconciliationId || typeof reconciliationId !== 'number') {
      return NextResponse.json(
        { error: 'reconciliationId es requerido y debe ser un numero' },
        { status: 400 },
      );
    }
    await conciliacionDeLaOrganizacion(ctx, reconciliationId);

    const validation = await balanceService.validateBalance(reconciliationId);
    return NextResponse.json({ success: true, data: validation });
  } catch (error) {
    return routeErrorResponse('Open Finance Validate Balance POST', error);
  }
});
