// ============================================================
// /api/integrations/open-finance/anomalies
// Deteccion de anomalias en transacciones bancarias de la organizacion
// GET - retorna todas las anomalias de la organizacion de la sesion
//
// SEGURIDAD (GO-sec, 2026-09-23): la organizacion salia de `?organizationId=`
// (lectura cruzada con service role). Ahora sale de la sesion; un
// `?organizationId=` ajeno responde 403 y queda registrado.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { anomalyDetectionService } from '@/lib/services/integrations/openFinance/anomalyDetectionService';

const RUTA = 'open-finance/anomalies';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const summary = await anomalyDetectionService.getAllAnomalies(ctx.organizationId);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return routeErrorResponse('Open Finance Anomalies GET', error);
  }
});
