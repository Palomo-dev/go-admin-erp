// ============================================================
// /api/integrations/open-finance/consents/[id]/renew
// Renueva un consentimiento de la organizacion de la sesion
// POST - renueva el consentimiento (extiende 90 dias)
//
// SEGURIDAD (GO-sec, 2026-09-23): antes renovaba el consentimiento de
// cualquier organizacion por id. Ahora tiene que ser de la organizacion de la
// sesion (404) y exige `finance.create`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';
import { consentimientoDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/consents/[id]/renew';

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const params = routeParams ? await routeParams.params : {};
    const id = typeof params.id === 'string' ? params.id : '';
    await consentimientoDeLaOrganizacion(ctx, id);

    const result = await consentService.renewConsent(id, ctx.userId);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse('Open Finance Consent Renew POST', error);
  }
});
