// ============================================================
// /api/integrations/open-finance/institutions
// Lista instituciones bancarias disponibles por proveedor (lista estatica)
// GET - lista instituciones (query: ?provider=prometeo)
//
// SEGURIDAD (GO-sec, 2026-09-23): sesion + organizacion de la sesion
// (`withOrg`) y `finance.view`, como el resto de Open Finance.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

const RUTA = 'open-finance/institutions';

export const GET = withOrg(async (ctx, request) => {
  try {
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);
    const provider = new URL(request.url).searchParams.get('provider') ?? 'prometeo';
    const institutions = await openFinanceService.getInstitutions(provider);
    return NextResponse.json({ success: true, data: institutions });
  } catch (error) {
    return routeErrorResponse('Open Finance Institutions GET', error);
  }
});
