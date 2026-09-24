// ============================================================
// /api/integrations/open-finance/payment-history
// Historial de pagos a un proveedor de la organizacion via Open Finance
// GET - (query: ?supplierId=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): la organizacion salia de `?organizationId=`.
// Ahora sale de la sesion (ajena → 403) y el proveedor tiene que ser de ella.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { paymentInitiationService } from '@/lib/services/integrations/openFinance/paymentInitiationService';
import { proveedorDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/payment-history';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const supplierId = Number(new URL(request.url).searchParams.get('supplierId'));
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: 'supplierId es requerido' }, { status: 400 });
    }
    await proveedorDeLaOrganizacion(ctx, supplierId);

    const history = await paymentInitiationService.getPaymentHistory(supplierId, ctx.organizationId);
    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    return routeErrorResponse('Open Finance Payment History GET', error);
  }
});
