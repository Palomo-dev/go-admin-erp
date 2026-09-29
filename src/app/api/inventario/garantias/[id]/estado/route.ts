/**
 * POST /api/inventario/garantias/[id]/estado — aprobar un reclamo pendiente o
 * rechazarlo con motivo (la unidad vuelve al cliente como vendida).
 * Body `{ accion: 'aprobar' | 'rechazar', motivo? }`. Permiso de gestionar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cambiarEstadoReclamoSchema } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirGestionar, leerCuerpo, respuestaError, rpc, uuidDeRuta } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/inventario/garantias/[id]/estado';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, cambiarEstadoReclamoSchema, RUTA);
    const id = await uuidDeRuta(routeParams);
    await exigirGestionar(ctx, RUTA);
    const resultado = await rpc<{ id: string; estado: string }>(ctx, 'fn_garantia_cambiar_estado', {
      p_org: ctx.organizationId,
      p_id: id,
      p_accion: cuerpo.accion,
      p_motivo: cuerpo.motivo ?? null,
    });
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
