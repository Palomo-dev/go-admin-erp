// ============================================================
// /api/integrations/open-finance/balances
// Saldos de las cuentas de un link de la organizacion
// GET - obtiene saldos (query: ?linkId=xxx&accountId=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): el link tiene que ser de la organizacion
// de la sesion (404 si no); ver `openFinance/seguridadRutas.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';
import { linkDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/balances';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');
    const accountId = searchParams.get('accountId') ?? undefined;
    if (!linkId) {
      return NextResponse.json({ error: 'linkId es requerido' }, { status: 400 });
    }
    await linkDeLaOrganizacion(ctx, linkId);

    const balances = await openFinanceService.getBalances(null, linkId, accountId);
    return NextResponse.json({ success: true, data: balances });
  } catch (error) {
    return routeErrorResponse('Open Finance Balances GET', error);
  }
});
