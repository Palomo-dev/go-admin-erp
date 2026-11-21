/**
 * GET /api/pos/devoluciones/caja?sucursal= — la sesión de caja abierta de la
 * que saldría el efectivo de una devolución de esa sucursal, o `null`
 * (diálogo «Crear devolución», Figma `874:578327`). Usa `fn_caja_abierta_para`,
 * la misma regla con la que `procesar_devolucion` elige la caja (o bloquea el
 * efectivo). Solo informa: la RPC vuelve a decidir al procesar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { sucursalDeQuery } from '@/lib/pos/ventas/listadoServidor';
import { cajaParaDevolucion, ErrorDevoluciones } from '@/lib/pos/devoluciones/listadoServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const sucursal = sucursalDeQuery(new URL(req.url));
  if (!sucursal) return NextResponse.json({ error: 'Falta la sucursal', codigo: 'sucursal_invalida' }, { status: 400 });
  try {
    const caja = await cajaParaDevolucion(ctx, sucursal);
    return NextResponse.json(caja, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorDevoluciones) {
      if (err.status >= 500) console.error('[pos/devoluciones/caja]', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.status >= 500 ? 'No se pudo leer la caja' : err.message, codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
