// ============================================================
// /api/integrations/open-finance/movements
// Obtiene movimientos de una cuenta de un link de la organizacion y los persiste
// GET - (query: ?linkId=xxx&accountId=xxx&dateFrom=xxx&dateTo=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): el link tiene que ser de la organizacion
// de la sesion (404 si no). Como ademas ESCRIBE transacciones, exige
// `finance.create`. Ver `openFinance/seguridadRutas.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';
import { linkDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/movements';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');
    const accountId = searchParams.get('accountId') ?? undefined;
    const dateFrom = searchParams.get('dateFrom') ?? undefined;
    const dateTo = searchParams.get('dateTo') ?? undefined;

    if (!linkId || !accountId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'linkId, accountId, dateFrom y dateTo son requeridos' },
        { status: 400 },
      );
    }
    await linkDeLaOrganizacion(ctx, linkId);

    const movements = await openFinanceService.getMovements(null, linkId, accountId, dateFrom, dateTo);
    const saved = await openFinanceService.saveTransactions(null, linkId, accountId, movements);

    return NextResponse.json({ success: true, data: movements, saved });
  } catch (error) {
    return routeErrorResponse('Open Finance Movements GET', error);
  }
});
