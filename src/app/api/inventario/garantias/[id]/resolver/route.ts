/**
 * POST /api/inventario/garantias/[id]/resolver — cierra el reclamo con
 * reparación, reemplazo por otra unidad del mismo producto en stock o
 * reembolso. Guarda quién resolvió (antes siempre nulo). No mueve stock: el
 * descuento de la unidad de reemplazo queda anotado para el núcleo (B0).
 * Body `{ tipo, serial_reemplazo?, monto?, notas?, respuesta_proveedor? }`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { resolverReclamoSchema } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirGestionar, leerCuerpo, respuestaError, rpc, uuidDeRuta } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/inventario/garantias/[id]/resolver';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const cuerpo = await leerCuerpo(ctx, req, resolverReclamoSchema, RUTA);
    const id = await uuidDeRuta(routeParams);
    await exigirGestionar(ctx, RUTA);
    const resultado = await rpc<{ id: string; estado: string; tipo: string; reemplazo: string | null }>(ctx, 'fn_garantia_resolver', {
      p_org: ctx.organizationId,
      p_id: id,
      p_datos: cuerpo,
    });
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
