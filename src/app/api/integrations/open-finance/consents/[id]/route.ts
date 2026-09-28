// ============================================================
// /api/integrations/open-finance/consents/[id]
// Un consentimiento de la organizacion de la sesion
// GET    - obtiene un consentimiento por ID
// DELETE - revoca un consentimiento (body: { reason })
//
// SEGURIDAD (GO-sec, 2026-09-23): antes leia o revocaba el consentimiento de
// CUALQUIER organizacion por id (y revocar uno ajeno revocaba tambien su link).
// Ahora el consentimiento tiene que ser de la organizacion de la sesion (404).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';
import { consentimientoDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/consents/[id]';

type RouteParams = { params: Promise<Record<string, string | string[] | undefined>> };

async function idDeLaRuta(routeParams?: RouteParams): Promise<string> {
  const params = routeParams ? await routeParams.params : {};
  return typeof params.id === 'string' ? params.id : '';
}

// GET - obtiene un consentimiento por ID
export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const id = await idDeLaRuta(routeParams);
    await consentimientoDeLaOrganizacion(ctx, id);

    const consent = await consentService.getConsent(id);
    if (!consent) {
      return NextResponse.json({ error: 'Consentimiento no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: consent });
  } catch (error) {
    return routeErrorResponse('Open Finance Consent GET', error);
  }
});

// DELETE - revoca un consentimiento
export const DELETE = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = await readOrgBody<{ reason?: string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const id = await idDeLaRuta(routeParams);
    await consentimientoDeLaOrganizacion(ctx, id);

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json({ error: 'El motivo de revocacion es requerido' }, { status: 400 });
    }

    const result = await consentService.revokeConsent(id, reason);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse('Open Finance Consent DELETE', error);
  }
});
