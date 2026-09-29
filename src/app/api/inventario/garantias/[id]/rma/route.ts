/**
 * POST /api/inventario/garantias/[id]/rma — envía la unidad al proveedor: el
 * reclamo pasa a «En proceso» y se guardan el número de RMA (antes se perdía),
 * el proveedor, la transportadora, la guía y las notas.
 * Body `{ rma, proveedor?, transportadora?, guia?, notas? }`. Permiso de gestionar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { enviarRmaSchema } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirGestionar, leerCuerpo, respuestaError, rpc, uuidDeRuta } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/inventario/garantias/[id]/rma';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, enviarRmaSchema, RUTA);
    const id = await uuidDeRuta(routeParams);
    await exigirGestionar(ctx, RUTA);
    const resultado = await rpc<{ id: string; estado: string; rma: string }>(ctx, 'fn_garantia_enviar_rma', {
      p_org: ctx.organizationId,
      p_id: id,
      p_datos: cuerpo,
    });
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
