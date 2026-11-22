/**
 * GET /api/pos/devoluciones/cifras?… — KPI del listado de devoluciones (Figma
 * `873:573998`): devuelto en el periodo por método, número de devoluciones con
 * unidades y parciales, ventas del periodo (base del %) y motivo principal.
 * Mismos parámetros y lista blanca que `GET /api/pos/devoluciones` (sin orden
 * ni paginación). La organización sale de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { queryAObjeto, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';
import { cifrasDevoluciones, ErrorDevoluciones } from '@/lib/pos/devoluciones/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  try {
    const cifras = await cifrasDevoluciones(ctx, queryAObjeto(url), sucursalDeQuery(url));
    return NextResponse.json(cifras, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorDevoluciones) {
      if (err.status >= 500) console.error('[pos/devoluciones/cifras]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron calcular las cifras' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
