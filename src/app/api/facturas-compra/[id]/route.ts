/**
 * DELETE /api/facturas-compra/[id] — elimina un BORRADOR de factura de compra
 * (`fn_factura_compra_eliminar_borrador`): sin pagos ni asiento; borra líneas,
 * retenciones, impuestos, seriales en inventario, comisión devengada y la CxP
 * que los caminos viejos creaban para el borrador. Una confirmada se anula.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { eliminarBorradorCompra } from '@/lib/services/compras/facturasCompra.server';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, respuestaError } from '@/lib/services/compras/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'DELETE /api/facturas-compra/[id]';

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.create'], RUTA);
    await exigirDeLaOrg(ctx, 'invoice_purchase', id);
    await eliminarBorradorCompra(ctx, id);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
