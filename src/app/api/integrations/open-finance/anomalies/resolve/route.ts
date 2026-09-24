// ============================================================
// /api/integrations/open-finance/anomalies/resolve
// Marca una anomalia como resuelta
// POST - body: { anomalyId, resolution }
//
// SEGURIDAD (GO-sec, 2026-09-23): sesion + organizacion de la sesion,
// `readOrgBody` (organizacion ajena → 403) y `finance.create`. El servicio hoy
// no persiste nada (auditoria §1.2); la guarda queda puesta para cuando lo haga.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { anomalyDetectionService } from '@/lib/services/integrations/openFinance/anomalyDetectionService';

const RUTA = 'open-finance/anomalies/resolve';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ anomalyId?: string | number; resolution?: string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const { anomalyId, resolution } = body;
    if (!anomalyId || !resolution) {
      return NextResponse.json({ error: 'anomalyId y resolution son requeridos' }, { status: 400 });
    }

    const result = await anomalyDetectionService.markAnomalyResolved(
      String(anomalyId),
      String(resolution),
      ctx.userId,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse('Open Finance Anomalies Resolve POST', error);
  }
});
