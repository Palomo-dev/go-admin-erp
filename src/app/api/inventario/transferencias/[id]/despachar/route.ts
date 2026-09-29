/**
 * POST /api/inventario/transferencias/[id]/despachar — P7: el traslado sale
 * del origen (transfer_out al costo promedio del origen, lotes por FEFO y
 * seriales a «en tránsito») y queda en tránsito (fn_traslado_despachar;
 * `trasladar`). P5: si dejaría el origen en negativo responde 409
 * `stock_insuficiente` con el detalle y no mueve nada. Despachar dos veces no
 * vuelve a descontar (`ya_despachado`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { despacharSchema, type ResultadoOperacion } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, idDeRuta, leerCuerpo, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'POST /api/inventario/transferencias/[id]/despachar';
  try {
    const id = await idDeRuta(routeParams);
    const datos = await leerCuerpo(ctx, req, despacharSchema, RUTA);
    const r = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_despachar', {
      p_org: ctx.organizationId,
      p_id: id,
      p_seriales: datos.seriales && Object.keys(datos.seriales).length > 0 ? datos.seriales : null,
      p_clave: datos.clave ?? null,
    });
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
