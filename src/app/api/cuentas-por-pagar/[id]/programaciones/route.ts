/**
 * POST /api/cuentas-por-pagar/[id]/programaciones — programa un pago a
 * proveedor (`fn_programar_pago`). Un pago programado NO es un pago (D3): queda
 * en `ap_payment_schedules` hasta que otra persona con `finance.approve` lo
 * apruebe (D7). La fecha programada va en su columna y la referencia no se
 * vuelve a tocar.
 *
 * Permiso `finance.create`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { programarPagoSchema } from '@/lib/services/compras/contrato';
import { programarPago } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/cuentas-por-pagar/[id]/programaciones';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const datos = await leerCuerpo(ctx, req, programarPagoSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    await exigirDeLaOrg(ctx, 'accounts_payable', id);
    const programacionId = await programarPago(ctx, id, datos);
    return NextResponse.json({ resultado: { id: programacionId } }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
