/**
 * POST /api/inventario/transferencias/[id]/recibir — P7: quien recibe confirma
 * lo que llegó (fn_traslado_recibir; `trasladar` o `recibir`). Entra al
 * destino con transfer_in al mismo costo con que salió; la diferencia de cada
 * renglón se decide: «faltante» (con motivo: merma en el destino) o
 * «en_camino» (sigue en tránsito). Con la misma `clave` la recepción no se
 * registra dos veces (`repetido`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { recibirSchema, type ResultadoOperacion } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, idDeRuta, leerCuerpo, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'POST /api/inventario/transferencias/[id]/recibir';
  try {
    const id = await idDeRuta(routeParams);
    const datos = await leerCuerpo(ctx, req, recibirSchema, RUTA);
    const r = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_recibir', {
      p_org: ctx.organizationId,
      p_id: id,
      p_lineas: datos.lineas,
      p_clave: datos.clave,
    });
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
