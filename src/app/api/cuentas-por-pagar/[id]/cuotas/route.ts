/**
 * POST   /api/cuentas-por-pagar/[id]/cuotas — crea (o reemplaza, si ninguna
 *        cuota tiene abonos) el plan de cuotas: `fn_cxp_crear_plan_cuotas`. El
 *        capital debe sumar el saldo de la cuenta.
 * DELETE /api/cuentas-por-pagar/[id]/cuotas — elimina el plan sin abonos.
 *
 * Pagar una cuota es el pago único (`/api/pagos` con `cuota_id`), no esta ruta.
 * Permiso `finance.create`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { planCuotasSchema } from '@/lib/services/compras/contrato';
import { crearPlanCuotas, eliminarPlanCuotas } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'POST /api/cuentas-por-pagar/[id]/cuotas';
  try {
    const { cuotas } = await leerCuerpo(ctx, req, planCuotasSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    await exigirDeLaOrg(ctx, 'accounts_payable', id);
    const n = await crearPlanCuotas(ctx, id, cuotas);
    return NextResponse.json({ resultado: { cuotas: n } }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'DELETE /api/cuentas-por-pagar/[id]/cuotas';
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    await exigirDeLaOrg(ctx, 'accounts_payable', id);
    const n = await eliminarPlanCuotas(ctx, id);
    return NextResponse.json({ resultado: { eliminadas: n } }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
