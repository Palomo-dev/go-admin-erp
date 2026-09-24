// ============================================================
// /api/integrations/open-finance/transfer
// POST - iniciar transferencia bancaria — DESHABILITADO (501, fail-closed)
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §1.4, hallazgo 1):
// cualquier usuario con sesion iniciaba una transferencia con la LLAVE DE LA
// PLATAFORMA (`POST /payout/` en el host banking de Prometeo), sin cuenta de
// origen de la organizacion, sin sesion bancaria del cliente, sin idempotencia
// y sin registro. El flujo no puede asegurarse sin redisenar el producto de
// pagos (preprocess/confirm con OTP del cliente desde SU cuenta), asi que la
// ruta responde 501 despues de exigir sesion, organizacion y `finance.approve`,
// y NUNCA llama al proveedor.
// ============================================================

import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { flujoDeshabilitado, PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { MOTIVO_PAGOS_DESHABILITADOS } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/transfer';

export const POST = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);
    console.warn(`[${RUTA}] intento de transferencia rechazado (flujo deshabilitado)`, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    return flujoDeshabilitado(MOTIVO_PAGOS_DESHABILITADOS);
  } catch (error) {
    return routeErrorResponse('Open Finance Transfer POST', error);
  }
});
