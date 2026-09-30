/**
 * GET /api/inicio/hoy?sucursal=N — cifras del bloque «Hoy» del inicio
 * (Figma `445:137185`, docs/design/SHELL-FIGMA-A-CODIGO.md §4).
 *
 * - La organización sale de la sesión (`withOrg`), nunca de la query.
 * - Solo quien ve el panel completo del inicio (`veePanelCompleto`, misma
 *   regla que la pantalla) recibe estas cifras; el resto, 403.
 * - `sucursal` es opcional (sin ella = todas las sucursales que la persona
 *   ve); si llega, tiene que ser de la organización del contexto.
 * - Cada casilla aplica además su propio permiso en la base (cartera y stock
 *   por RPC; el resto por RLS con el cliente de la sesión).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { veePanelCompleto } from '@/lib/dashboard/accesoPanel';
import { datosHoy, sucursalValida } from '@/lib/dashboard/bloqueHoy.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

/** Entero positivo o `null` (mismo criterio que las demás rutas con `?sucursal=`). */
function sucursalDeQuery(url: URL): number | null {
  const v = Number(url.searchParams.get('sucursal'));
  return Number.isInteger(v) && v > 0 ? v : null;
}

export const GET = withOrg(async (ctx, req) => {
  if (!veePanelCompleto({ roleId: ctx.roleId, isSuperAdmin: ctx.isSuperAdmin })) {
    return NextResponse.json({ error: 'Sin permiso para ver el resumen del inicio', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const url = new URL(req.url);
  const crudo = url.searchParams.get('sucursal');
  const sucursal = sucursalDeQuery(url);
  if (crudo !== null && crudo !== '' && (sucursal === null || !(await sucursalValida(ctx, sucursal)))) {
    return NextResponse.json({ error: 'Sucursal no válida', codigo: 'sucursal_invalida' }, { status: 400, headers: SIN_CACHE });
  }
  const datos = await datosHoy(ctx, sucursal);
  return NextResponse.json({ ...datos, generadoEn: new Date().toISOString() }, { headers: SIN_CACHE });
});
