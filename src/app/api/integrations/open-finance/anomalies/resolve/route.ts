// ============================================================
// /api/integrations/open-finance/anomalies/resolve
// Guarda la revision de una alerta de cuentas de dinero.
// POST - body: { clave, tipo, motivo, resultado?, cuentaId?, movimientoAnuladoId? }
//        (acepta tambien los nombres viejos `anomalyId` y `resolution`)
//
// SEGURIDAD (GO-sec, 2026-09-23): sesion + organizacion de la sesion,
// `readOrgBody` (organizacion ajena → 403) y `finance.create`.
//
// Finanzas, ronda 2 (A1/A2, 2026-11-07): antes el servicio solo hacia
// `console.log`. Ahora guarda autor (la sesion), fecha y motivo en
// `bank_alert_reviews` con el cliente de la sesion (RLS). Sin la tabla
// (migracion 20261107210000 sin aplicar) responde 503 `revision_no_disponible`
// y la pantalla lo explica.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import {
  ErrorRevisionAlerta,
  anomalyDetectionService,
} from '@/lib/services/integrations/openFinance/anomalyDetectionService';
import { validarRevision } from '@/lib/services/integrations/openFinance/alertasBancarias';

const RUTA = 'open-finance/anomalies/resolve';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const validacion = validarRevision(body);
    if (!validacion.valido) {
      return NextResponse.json({ success: false, error: validacion.error }, { status: 400 });
    }

    const result = await anomalyDetectionService.markAnomalyResolved(
      ctx.supabase,
      ctx.organizationId,
      validacion.entrada,
      ctx.userId,
    );
    return NextResponse.json({ success: true, data: result.revision });
  } catch (error) {
    if (error instanceof ErrorRevisionAlerta) {
      return NextResponse.json({ success: false, error: error.codigo }, { status: error.status });
    }
    return routeErrorResponse('Open Finance Anomalies Resolve POST', error);
  }
});
