/**
 * GET /api/pos/ventas — listado de ventas paginado, filtrado y ordenado en el
 * servidor (`pos_ventas_listado`, solo filas de `sales`; D1 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * Query: `q`, `origen`, `estado`, `metodo`, `cliente`, `cajero`, `desde`,
 * `hasta` (días de la organización), `min`, `max`, `orden`, `dir`, `pagina`,
 * `tamano` (lista blanca de `filtrosVentas`) y `sucursal` (la del selector;
 * la base comprueba el acceso). La organización sale de la sesión (`withOrg`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ErrorVentas, listarVentas, queryAObjeto, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  try {
    const r = await listarVentas(ctx, queryAObjeto(url), sucursalDeQuery(url));
    return NextResponse.json(
      { total: r.total, filas: r.filas, pagina: r.pagina, tamano: r.tamano },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    if (err instanceof ErrorVentas) {
      if (err.status >= 500) console.error('[pos/ventas] listado', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron leer las ventas' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
