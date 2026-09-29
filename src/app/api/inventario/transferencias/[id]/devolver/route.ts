/**
 * POST /api/inventario/transferencias/[id]/devolver — lo que sigue en tránsito
 * vuelve al origen con transfer_in al mismo costo con que salió
 * (fn_traslado_devolver; `trasladar`). Sin nada recibido, el traslado queda
 * cancelado; con parte recibida, queda recibido. Idempotente con `clave`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { motivoSchema, type ResultadoOperacion } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, idDeRuta, leerCuerpo, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'POST /api/inventario/transferencias/[id]/devolver';
  try {
    const id = await idDeRuta(routeParams);
    const datos = await leerCuerpo(ctx, req, motivoSchema, RUTA);
    const r = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_devolver', {
      p_org: ctx.organizationId,
      p_id: id,
      p_motivo: datos.motivo ?? null,
      p_clave: datos.clave ?? null,
    });
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
