/**
 * GET /api/inventario/transferencias/productos?origen=&q=&ids= — buscador del
 * nuevo traslado: productos con control de stock de la organización de la
 * sesión, con lo disponible en la sucursal de origen por lote
 * (fn_traslado_productos; `ver`). Sin `q` ni `ids`, los que tienen existencia
 * en el origen.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { productosQuerySchema, type ProductoTrasladable } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, leerQuery, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const RUTA = 'GET /api/inventario/transferencias/productos';
  try {
    const q = await leerQuery(ctx, req, productosQuerySchema, RUTA, ['ids']);
    const filas = await rpc<ProductoTrasladable[]>(ctx, 'fn_traslado_productos', {
      p_org: ctx.organizationId,
      p_origen: q.origen,
      p_busqueda: q.q ?? null,
      p_ids: q.ids && q.ids.length > 0 ? q.ids : null,
      p_limite: q.limite ?? 30,
    });
    return NextResponse.json(filas, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
