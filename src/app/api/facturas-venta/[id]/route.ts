/**
 * GET /api/facturas-venta/[id] — detalle agregado de una factura de venta:
 * cabecera, cliente, líneas, pagos (vivos y anulados), notas crédito, cartera,
 * asientos, estado DIAN e historial. Con sesión y permiso `finance.view`; la
 * factura debe ser de la organización de la sesión (404 si no).
 *
 * No es la ruta pública que se retiró: exige sesión, organización y permiso.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import { detalleFactura, ErrorFacturaServidor } from '@/lib/services/ventas/facturasVenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/facturas-venta/[id]' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await detalleFactura(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorFacturaServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
