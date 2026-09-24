/**
 * GET /api/facturas-venta — listado paginado, filtrado y ordenado en el
 * servidor (`fn_facturas_venta_listado`) con los KPIs del periodo. Sesión,
 * organización de la sesión y permiso `finance.view`. La query pasa por listas
 * blancas (`consultaFacturasDesde`); una organización ajena en ella → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import { consultaFacturasDesde } from '@/lib/finanzas/ventas/listadoFacturas';
import { ErrorFacturaServidor, listadoFacturas } from '@/lib/services/ventas/facturasVenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/facturas-venta' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const consulta = consultaFacturasDesde(new URL(req.url).searchParams);
    return NextResponse.json(await listadoFacturas(ctx, consulta), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorFacturaServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
