// ============================================================
// /api/integrations/open-finance/validate-account
// POST - validar una cuenta bancaria arbitraria — DESHABILITADO (501)
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §1.4, hallazgo 13): con cualquier
// numero de cuenta y documento servia de oraculo de titulares (datos
// personales) y consumia sin limite la cuota de Prometeo de la plataforma
// (ademas llamaba un host y una ruta que no son los de Account Validation).
// Sin consumidor en la UI. Responde 501 despues de sesion, organizacion y
// `finance.approve`; la validacion de proveedores PROPIOS sigue en
// `validate-supplier`.
// ============================================================

import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { flujoDeshabilitado, PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { MOTIVO_VALIDACION_DESHABILITADA } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/validate-account';

export const POST = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);
    return flujoDeshabilitado(MOTIVO_VALIDACION_DESHABILITADA);
  } catch (error) {
    return routeErrorResponse('Open Finance Validate Account POST', error);
  }
});
