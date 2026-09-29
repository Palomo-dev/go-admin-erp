/**
 * GET /api/inventario/garantias/[id] — detalle del reclamo (unidad, venta,
 * cliente, garantía, RMA, resolución e historial del serial). Antes el detalle
 * no cargaba: pedía relaciones con nombres que no existen. Un reclamo de otra
 * organización es 404.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import type { GarantiaDetalle } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, leerQuery, respuestaError, rpc, uuidDeRuta } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/garantias/[id]';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    await leerQuery(ctx, req, z.object({}).strict(), RUTA);
    const id = await uuidDeRuta(routeParams);
    await exigirVer(ctx, RUTA);
    const detalle = await rpc<GarantiaDetalle>(ctx, 'fn_garantia_detalle', { p_org: ctx.organizationId, p_id: id });
    return NextResponse.json(detalle, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
