/**
 * GET /api/pos/devoluciones/[id] — el detalle de una devolución en UNA
 * respuesta (Figma `874:578562`): líneas, motivo, venta original con factura y
 * cobros, nota crédito, egreso de caja o saldo a favor, asientos e historial.
 * Organización de la sesión; lectura con el cliente de la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleDevolucion, ErrorDetalleDevolucion } from '@/lib/pos/devoluciones/detalleServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  try {
    const devolucion = await detalleDevolucion(ctx, id);
    return NextResponse.json(devolucion, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorDetalleDevolucion) {
      if (err.status >= 500) console.error('[pos/devoluciones/[id]] lectura', { id, organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudo leer la devolución' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
