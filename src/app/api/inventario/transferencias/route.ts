/**
 * /api/inventario/transferencias — traslados entre sucursales (inventario B3).
 *
 * GET: listado paginado de la organización de la sesión con KPI, traslados
 *   atascados y permisos (fn_traslados_listado; exige `ver`).
 * POST: crea un traslado pendiente (fn_traslado_guardar; exige `trasladar`) y,
 *   con `despachar: true`, lo despacha en seguida (fn_traslado_despachar): sale
 *   del origen y queda en tránsito. Con la misma `clave` no se crea dos veces.
 *   Si el despacho falla, el traslado queda pendiente y la respuesta lo dice
 *   (`creado` + `codigo` del error de despacho).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import {
  filtrosTrasladosSchema,
  guardarTrasladoSchema,
  type DetalleTraslado,
  type ListadoTraslados,
  type ResultadoOperacion,
} from '@/lib/inventario/transferencias/contrato';
import {
  ErrorRpcTraslado,
  SIN_CACHE,
  leerCuerpo,
  leerQuery,
  permisosTraslados,
  respuestaError,
  rpc,
} from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const RUTA = 'GET /api/inventario/transferencias';
  try {
    const filtros = await leerQuery(ctx, req, filtrosTrasladosSchema, RUTA, ['estados']);
    const [listado, permisos] = await Promise.all([
      rpc<Omit<ListadoTraslados, 'permisos'>>(ctx, 'fn_traslados_listado', { p_org: ctx.organizationId, p_filtros: filtros }),
      permisosTraslados(ctx),
    ]);
    return NextResponse.json({ ...listado, permisos }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  const RUTA = 'POST /api/inventario/transferencias';
  try {
    const datos = await leerCuerpo(ctx, req, guardarTrasladoSchema, RUTA);
    const creado = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_guardar', {
      p_org: ctx.organizationId,
      p_traslado: {
        origen: datos.origen,
        destino: datos.destino,
        notas: datos.notas ?? null,
        production_order_id: datos.production_order_id ?? null,
        items: datos.items,
      },
      p_clave: datos.clave ?? null,
    });
    if (!datos.despachar) return NextResponse.json(creado, { status: creado.repetido ? 200 : 201, headers: SIN_CACHE });

    try {
      // Los seriales llegan por posición del renglón; la RPC los quiere por id.
      let seriales: Record<string, number[]> | null = null;
      if (datos.seriales && Object.keys(datos.seriales).length > 0) {
        const detalle = await rpc<Omit<DetalleTraslado, 'permisos'>>(ctx, 'fn_traslado_detalle', {
          p_org: ctx.organizationId,
          p_id: creado.id,
        });
        seriales = {};
        for (const [indice, ids] of Object.entries(datos.seriales)) {
          const item = detalle.items[Number(indice)];
          if (item) seriales[String(item.id)] = ids;
        }
      }
      const despachado = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_despachar', {
        p_org: ctx.organizationId,
        p_id: creado.id,
        p_seriales: seriales,
        p_clave: datos.clave ?? null,
      });
      return NextResponse.json({ ...creado, ...despachado }, { status: 201, headers: SIN_CACHE });
    } catch (err) {
      if (err instanceof ErrorRpcTraslado) {
        // Creado pero no despachado: la interfaz abre el detalle y explica por qué.
        return NextResponse.json(
          { ...creado, creado: true, codigo: err.codigo, detalle: err.detalle },
          { status: 207, headers: SIN_CACHE },
        );
      }
      throw err;
    }
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
