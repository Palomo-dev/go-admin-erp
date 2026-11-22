/**
 * GET /api/pos/ventas/cifras?… — KPI del listado de Ventas (Figma aprobado el
 * 2026-11-20): ventas del periodo con variación frente al periodo anterior,
 * ticket promedio, transacciones (pagadas · pendientes · anuladas) e impuestos
 * con su detalle. Mismos parámetros y lista blanca que `GET /api/pos/ventas`
 * (sin orden ni paginación): las cifras describen exactamente las ventas
 * listadas. Sale de `pos_ventas_cifras`; la organización sale de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cifrasVentas, ErrorVentas, queryAObjeto, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  try {
    const cifras = await cifrasVentas(ctx, queryAObjeto(url), sucursalDeQuery(url));
    return NextResponse.json(cifras, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorVentas) {
      if (err.status >= 500) console.error('[pos/ventas/cifras]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron calcular las cifras' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
