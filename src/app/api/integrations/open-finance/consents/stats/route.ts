// ============================================================
// /api/integrations/open-finance/consents/stats
// Estadisticas de consentimientos de la organizacion de la sesion
// GET - estadisticas
//
// SEGURIDAD (GO-sec, 2026-09-23): organizacion de la sesion (antes: query o
// «membresia mas reciente»); un `?organizationId=` ajeno responde 403.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';

const RUTA = 'open-finance/consents/stats';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const stats = await consentService.getConsentStats(ctx.organizationId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    return routeErrorResponse('Open Finance Consents Stats GET', error);
  }
});
