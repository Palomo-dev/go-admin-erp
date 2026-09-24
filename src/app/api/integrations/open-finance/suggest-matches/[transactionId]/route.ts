// ============================================================
// /api/integrations/open-finance/suggest-matches/[transactionId]
// Sugerencias de matching para una transaccion especifica.
// GET - sugerencias para la transaccion indicada en el path
//
// SEGURIDAD (GO-sec, 2026-09-23): organizacion de la sesion (`withOrg`) en
// lugar de «la membresia activa mas reciente»; `finance.view`. El servicio
// comprueba que la transaccion sea de la organizacion.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { aiMatchingService } from '@/lib/services/integrations/openFinance/aiMatchingService';

const RUTA = 'open-finance/suggest-matches/[transactionId]';

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const params = routeParams ? await routeParams.params : {};
    const transactionId = Number(params.transactionId);
    if (!Number.isInteger(transactionId) || transactionId <= 0) {
      return NextResponse.json({ error: 'transactionId debe ser un entero valido' }, { status: 400 });
    }

    const suggestions = await aiMatchingService.suggestMatchesForTransaction(transactionId, ctx.organizationId);
    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    return routeErrorResponse('Open Finance Suggest-Matches Transaction GET', error);
  }
});
