/**
 * GET /api/pos/devoluciones/ventas?q=&sucursal= — buscador del diálogo «Nueva
 * devolución» (Figma `874:577989`): ventas pagadas por número de factura,
 * cliente, documento o teléfono, con unidades vendidas y ya devueltas
 * (`pos_ventas_para_devolver`, exige `pos.refund`). Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';
import { ErrorDevoluciones, ventasParaDevolver } from '@/lib/pos/devoluciones/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const url = new URL(req.url);
  try {
    const ventas = await ventasParaDevolver(ctx, url.searchParams.get('q'), sucursalDeQuery(url));
    return NextResponse.json({ ventas }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorDevoluciones) {
      if (err.status >= 500) console.error('[pos/devoluciones/ventas]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudieron buscar las ventas' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
