/**
 * GET /api/inicio/actividad?periodo=…&sucursal=&tipo=&pagina=&tamano= —
 * «Actividad reciente» del inicio (Figma 445:137185, `447:73055`): filtros
 * Todo · Ventas · Facturas · Clientes · Inventario y paginación.
 *
 * Organización de la sesión (`withOrg`), panel completo, periodo y sucursal
 * validados (`pedidoPanel`); qué tipos ve la persona lo decide la base
 * (`fn_inicio_actividad`: módulo activo + permiso de lectura). 42501 → 403,
 * 22023 → 400.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { actividadDelInicio, rangoDelPeriodo } from '@/lib/dashboard/inicio.server';
import { leerPedidoActividad } from '@/lib/dashboard/actividadInicio';
import { manejarError, pedidoPanel, respuestaError, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const p = await pedidoPanel(ctx, req);
  if (p instanceof NextResponse) return p;
  const pedido = leerPedidoActividad(new URL(req.url).searchParams);
  if (!pedido) return respuestaError(400, 'pedido_invalido', 'Filtro o página no válidos');
  try {
    const rango = await rangoDelPeriodo(ctx, p.pedido, p.sucursal);
    const datos = await actividadDelInicio(ctx, rango, p.sucursal, pedido);
    return NextResponse.json({ ...datos, pagina: pedido.pagina, tamano: pedido.tamano }, { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('actividad', ctx, err);
  }
});
