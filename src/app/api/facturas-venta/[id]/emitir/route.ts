/**
 * POST /api/facturas-venta/[id]/emitir — emite un borrador en una transacción
 * (`fn_factura_venta_emitir`): faltantes de inventario, número, estado, cartera
 * y salida de kardex una sola vez. Permiso `finance.create` aquí y en la base.
 * Con faltantes responde 409 `stock_insuficiente` y la lista en `faltantes`.
 * La factura electrónica se encola después, por `POST /api/factus/invoice`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import { emitirFactura, ErrorFacturaServidor, faltantesDe } from '@/lib/services/ventas/facturasVenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'POST /api/facturas-venta/[id]/emitir' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[facturas-venta/emitir] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const resultado = await emitirFactura(ctx, id);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorFacturaServidor) {
      return NextResponse.json(
        { error: err.codigo, codigo: err.codigo, faltantes: err.codigo === 'stock_insuficiente' ? faltantesDe(err) : undefined },
        { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE },
      );
    }
    throw err;
  }
});
