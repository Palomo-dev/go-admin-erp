/**
 * GET /api/pos/ventas/cifras?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sucursal=N — KPI
 * de Ventas con CRITERIO DE CAJA (D2 de docs/implementacion/CAJAS-VENTAS-PLAN.md,
 * PARIDAD-DASHBOARD-INICIO §V.9c): lo cobrado en el periodo por fecha de pago,
 * menos reintegros, con el periodo anterior de igual duración. Sale de
 * `fn_inicio_ventas_rango`, la misma función que usará el Inicio.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cifrasVentas, ErrorVentas, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';
import { filtrosVentas } from '@/lib/pos/ventas/filtrosVentas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  // Mismas fechas validadas que el listado.
  const f = filtrosVentas({ desde: url.searchParams.get('desde') ?? undefined, hasta: url.searchParams.get('hasta') ?? undefined });
  try {
    const cifras = await cifrasVentas(ctx, f.desde, f.hasta, sucursalDeQuery(url));
    return NextResponse.json(cifras, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorVentas) {
      if (err.status >= 500) console.error('[pos/ventas/cifras]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron calcular las cifras' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
