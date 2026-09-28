// ============================================================
// /api/integrations/open-finance/validate-supplier
// Valida la cuenta bancaria de un proveedor DE LA ORGANIZACION
// POST - body: { supplierId }
//
// SEGURIDAD (GO-sec, 2026-09-23): aceptaba cualquier proveedor (datos de
// titulares de otra organizacion y cuota de la plataforma). Ahora el proveedor
// tiene que ser de la organizacion de la sesion (404), organizacion ajena en el
// body → 403 y exige `finance.create`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { paymentInitiationService } from '@/lib/services/integrations/openFinance/paymentInitiationService';
import { proveedorDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/validate-supplier';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ supplierId?: number | string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const supplierId = Number(body.supplierId);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: 'supplierId es requerido' }, { status: 400 });
    }
    await proveedorDeLaOrganizacion(ctx, supplierId);

    const result = await paymentInitiationService.validateSupplierAccount(supplierId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse('Open Finance Validate Supplier POST', error);
  }
});
