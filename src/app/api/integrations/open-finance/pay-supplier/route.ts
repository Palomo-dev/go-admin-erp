// ============================================================
// /api/integrations/open-finance/pay-supplier
// POST - pagar una cuenta por pagar via Open Finance — DESHABILITADO (501)
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §1.4): recibia `accountPayableId` y
// `bankAccountId` del body sin organizacion (IDOR sobre dinero), iniciaba la
// transferencia con la llave de la plataforma, sin idempotencia, marcaba la
// cuenta por pagar `paid` con la transferencia `pending` y escribia
// `accounts_payable` a mano fuera de una RPC (regla 7). No puede asegurarse sin
// el rediseno del producto de pagos: responde 501 despues de exigir sesion,
// organizacion y `finance.approve`, y nunca llama al proveedor ni escribe nada.
// ============================================================

import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { flujoDeshabilitado, PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { MOTIVO_PAGOS_DESHABILITADOS } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/pay-supplier';

export const POST = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);
    console.warn(`[${RUTA}] intento de pago rechazado (flujo deshabilitado)`, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    return flujoDeshabilitado(MOTIVO_PAGOS_DESHABILITADOS);
  } catch (error) {
    return routeErrorResponse('Open Finance Pay Supplier POST', error);
  }
});
