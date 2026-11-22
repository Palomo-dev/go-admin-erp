/**
 * GET /api/pos/ventas/cajeros?sucursal=N — quiénes han registrado ventas en las
 * sucursales visibles para quien llama (o en la elegida): el selector
 * «Cajero» del panel de filtros de Ventas. Sale de `pos_ventas_cajeros`, que
 * comprueba la pertenencia y el acceso a la sucursal; la organización sale de
 * la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cajerosVentas, ErrorVentas, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  try {
    const cajeros = await cajerosVentas(ctx, sucursalDeQuery(url));
    return NextResponse.json({ cajeros }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorVentas) {
      if (err.status >= 500) console.error('[pos/ventas/cajeros]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron leer los cajeros' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
