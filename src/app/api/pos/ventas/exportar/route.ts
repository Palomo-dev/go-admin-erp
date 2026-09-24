/**
 * GET /api/pos/ventas/exportar?… — todas las ventas que cumplen los filtros
 * del listado (tope 5.000) para «Exportar». Exige `reports.sales` (o
 * administración) resuelto en el servidor (D14); sin él, 403 y registro.
 * El CSV lo arma el navegador con los encabezados en el idioma activo
 * (`src/lib/utils/csv.ts`, fórmulas neutralizadas).
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { ErrorVentas, exportarVentas, queryAObjeto, sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'reports.sales'))) {
    console.warn('[pos/ventas/exportar] sin permiso reports.sales', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso para exportar ventas', codigo: 'sin_permiso_exportar' }, { status: 403 });
  }
  const url = new URL(req.url);
  try {
    const r = await exportarVentas(ctx, queryAObjeto(url), sucursalDeQuery(url));
    return NextResponse.json(r, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorVentas) {
      if (err.status >= 500) console.error('[pos/ventas/exportar]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron exportar las ventas' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
