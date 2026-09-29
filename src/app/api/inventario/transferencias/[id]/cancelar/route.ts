/**
 * POST /api/inventario/transferencias/[id]/cancelar — cancela un traslado
 * PENDIENTE (aún no salió: no toca existencias). fn_traslado_cancelar;
 * `trasladar`. Uno en tránsito se devuelve al origen (…/devolver).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { motivoSchema, type ResultadoOperacion } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, idDeRuta, leerCuerpo, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const RUTA = 'POST /api/inventario/transferencias/[id]/cancelar';
  try {
    const id = await idDeRuta(routeParams);
    const datos = await leerCuerpo(ctx, req, motivoSchema, RUTA);
    const r = await rpc<ResultadoOperacion>(ctx, 'fn_traslado_cancelar', {
      p_org: ctx.organizationId,
      p_id: id,
      p_motivo: datos.motivo ?? null,
    });
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
