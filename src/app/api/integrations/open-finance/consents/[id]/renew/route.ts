// ============================================================
// /api/integrations/open-finance/consents/[id]/renew
// Renueva un consentimiento de la organizacion de la sesion
// POST - renueva el consentimiento (extiende 90 dias)
//
// SEGURIDAD (GO-sec, 2026-09-23): antes renovaba el consentimiento de
// cualquier organizacion por id. Ahora tiene que ser de la organizacion de la
// sesion (404) y exige `finance.create`.
//
// Finanzas, ronda 2 (A5, 2026-11-07): solo se renueva una autorizacion activa
// que vence en 7 dias o menos (`puedeRenovar`, la misma regla de la pantalla).
// Fuera de esa ventana responde 409 `fuera_de_ventana`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';
import { consentimientoDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';
import { puedeRenovar } from '@/lib/services/integrations/openFinance/conexionBancariaLogica';

const RUTA = 'open-finance/consents/[id]/renew';

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const params = routeParams ? await routeParams.params : {};
    const id = typeof params.id === 'string' ? params.id : '';
    await consentimientoDeLaOrganizacion(ctx, id);

    const actual = await consentService.getConsent(id);
    if (!actual) {
      return NextResponse.json({ error: 'Consentimiento no encontrado' }, { status: 404 });
    }
    if (!puedeRenovar(actual)) {
      return NextResponse.json(
        { error: 'Solo se renueva una autorizacion activa que vence en 7 dias o menos', code: 'fuera_de_ventana' },
        { status: 409 },
      );
    }

    const result = await consentService.renewConsent(id, ctx.userId);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse('Open Finance Consent Renew POST', error);
  }
});
