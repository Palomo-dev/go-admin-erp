// ============================================================
// /api/integrations/open-finance/accounts
// Lista cuentas bancarias asociadas a un link de la organizacion
// GET - lista cuentas (query: ?linkId=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): antes aceptaba cualquier `linkId` y llamaba
// al proveedor con la sesion bancaria de otra organizacion. Ahora el link
// tiene que ser de la organizacion de la sesion (404 si no); ver
// `openFinance/seguridadRutas.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';
import { linkDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/accounts';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const linkId = new URL(request.url).searchParams.get('linkId');
    if (!linkId) {
      return NextResponse.json({ error: 'linkId es requerido' }, { status: 400 });
    }
    await linkDeLaOrganizacion(ctx, linkId);

    const accounts = await openFinanceService.getAccounts(null, linkId);
    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    return routeErrorResponse('Open Finance Accounts GET', error);
  }
});
