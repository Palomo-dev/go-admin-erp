/**
 * GET /api/inicio/ventas?periodo=&horaInicio=&horaFin=&desde=&hasta=&sucursal=
 * — «Ventas del periodo» del inicio con desglose por canal (una sucursal) o
 * por sucursal («Todas»). Figma 445:137185; decisión del dueño V.9b/V.9c.
 *
 * Organización de la sesión (`withOrg`); periodo y sucursal validados; la
 * cifra sale de `fn_inicio_ventas_periodo` → `fn_inicio_ventas_rango` (la
 * misma regla que los KPI de Ventas del POS). Sin permiso de ventas en la
 * base: 403 y la tarjeta no se pinta.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { rangoDelPeriodo, ventasDelPeriodo } from '@/lib/dashboard/inicio.server';
import { manejarError, pedidoPanel, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const p = await pedidoPanel(ctx, req);
  if (p instanceof NextResponse) return p;
  try {
    const rango = await rangoDelPeriodo(ctx, p.pedido, p.sucursal);
    const datos = await ventasDelPeriodo(ctx, rango, p.sucursal);
    return NextResponse.json({ ...datos, unaSucursal: p.sucursal !== null }, { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('ventas', ctx, err);
  }
});
