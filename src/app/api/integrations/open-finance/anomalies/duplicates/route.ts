// ============================================================
// /api/integrations/open-finance/anomalies/duplicates
// Deteccion de transacciones duplicadas de la organizacion
// GET - retorna duplicados (query: ?dateFrom=xxx&dateTo=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): organizacion de la sesion; un
// `?organizationId=` ajeno responde 403 y queda registrado.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { anomalyDetectionService } from '@/lib/services/integrations/openFinance/anomalyDetectionService';

const RUTA = 'open-finance/anomalies/duplicates';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    const duplicates = await anomalyDetectionService.detectDuplicates(ctx.organizationId, dateFrom, dateTo);
    return NextResponse.json({ success: true, data: duplicates });
  } catch (error) {
    return routeErrorResponse('Open Finance Anomalies Duplicates GET', error);
  }
});
