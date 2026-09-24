// ============================================================
// /api/integrations/open-finance/suggest-matches
// Sugerencias de matching para conciliacion bancaria.
// GET  - sugerencias para una conciliacion (?reconciliationId=xxx)
// POST - auto-concilia matches de alta confianza (body: { reconciliationId })
//
// SEGURIDAD (GO-sec, 2026-09-23): la organizacion salia de «la membresia activa
// mas reciente» (`authHelpers.getActiveOrganizationId`, eliminado). Ahora sale
// de la sesion (`withOrg`), la organizacion ajena en body o query responde 403
// y hay permiso `finance.*`. El servicio sigue comprobando que la conciliacion
// sea de la organizacion.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { aiMatchingService } from '@/lib/services/integrations/openFinance/aiMatchingService';

const RUTA = 'open-finance/suggest-matches';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const reconciliationId = new URL(request.url).searchParams.get('reconciliationId');
    if (!reconciliationId) {
      return NextResponse.json({ error: 'reconciliationId es requerido' }, { status: 400 });
    }

    const suggestions = await aiMatchingService.suggestMatches(reconciliationId, ctx.organizationId);
    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    return routeErrorResponse('Open Finance Suggest-Matches GET', error);
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ reconciliationId?: string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const { reconciliationId } = body;
    if (!reconciliationId) {
      return NextResponse.json({ error: 'reconciliationId es requerido' }, { status: 400 });
    }

    const stats = await aiMatchingService.autoMatchHighConfidence(reconciliationId, ctx.organizationId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    return routeErrorResponse('Open Finance Suggest-Matches POST', error);
  }
});
