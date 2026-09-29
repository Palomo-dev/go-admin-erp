/**
 * /api/inventario/transferencias/[id] — un traslado de la organización de la
 * sesión (inventario B3). Uno de otra organización es 404, igual que uno que
 * no existe.
 *
 * GET: cabecera, renglones (lote, seriales, costo solo con permiso de costos,
 *   disponible en el origen), seguimiento, movimientos del kardex y permisos.
 * PUT: edita un traslado PENDIENTE (fn_traslado_guardar con id; `trasladar`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { guardarTrasladoSchema, type DetalleTraslado, type ResultadoOperacion } from '@/lib/inventario/transferencias/contrato';
import {
  SIN_CACHE,
  idDeRuta,
  leerCuerpo,
  leerQuery,
  permisosTraslados,
  respuestaError,
  rpc,
} from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'GET /api/inventario/transferencias/[id]';
  try {
    await leerQuery(ctx, req, z.object({}), RUTA);
    const id = await idDeRuta(routeParams);
    const [detalle, permisos] = await Promise.all([
      rpc<Omit<DetalleTraslado, 'permisos'>>(ctx, 'fn_traslado_detalle', { p_org: ctx.organizationId, p_id: id }),
      permisosTraslados(ctx),
    ]);
    return NextResponse.json({ ...detalle, permisos }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'PUT /api/inventario/transferencias/[id]';
  try {
    const id = await idDeRuta(routeParams);
    const datos = await leerCuerpo(ctx, req, guardarTrasladoSchema.omit({ despachar: true, seriales: true, clave: true }), RUTA);
    const r = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_guardar', {
      p_org: ctx.organizationId,
      p_traslado: {
        id,
        origen: datos.origen,
        destino: datos.destino,
        notas: datos.notas ?? null,
        production_order_id: datos.production_order_id ?? null,
        items: datos.items,
      },
      p_clave: null,
    });
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
