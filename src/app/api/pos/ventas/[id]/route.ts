/**
 * GET /api/pos/ventas/[id] — el detalle de una venta en UNA respuesta: venta,
 * líneas, factura y notas crédito, pagos, cartera, devoluciones, asientos,
 * mesa, pedido web, comisión y los permisos de sus acciones (paso 14 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). Organización de la sesión; lectura
 * con el cliente de la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleVenta, ErrorDetalleVenta } from '@/lib/pos/ventas/detalleServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  try {
    const venta = await detalleVenta(ctx, id);
    return NextResponse.json(venta, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorDetalleVenta) {
      if (err.status >= 500) console.error('[pos/ventas/[id]] lectura', { id, organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudo leer la venta' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
