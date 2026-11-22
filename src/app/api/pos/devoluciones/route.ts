/**
 * GET /api/pos/devoluciones — listado de devoluciones del POS paginado,
 * filtrado y ordenado en el servidor (`pos_devoluciones_listado`).
 *
 * Query: `q`, `estado`, `metodo`, `motivo` (listas separadas por coma),
 * `desde`, `hasta` (días de la organización; sin ellos, el mes en curso),
 * `orden`, `dir`, `pagina`, `tamano` (lista blanca de `filtrosDevoluciones`) y
 * `sucursal` (la del selector; la base comprueba el acceso). La organización
 * sale de la sesión (`withOrg`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { queryAObjeto, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';
import { ErrorDevoluciones, listarDevoluciones } from '@/lib/pos/devoluciones/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  try {
    const r = await listarDevoluciones(ctx, queryAObjeto(url), sucursalDeQuery(url));
    return NextResponse.json(r, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorDevoluciones) {
      if (err.status >= 500) console.error('[pos/devoluciones] listado', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron leer las devoluciones' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
