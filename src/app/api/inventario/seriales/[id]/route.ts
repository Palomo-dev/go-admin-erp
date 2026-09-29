/**
 * GET /api/inventario/seriales/[id] — detalle de un serial (origen, venta,
 * garantía, reclamos e historial con su documento). Un serial de otra
 * organización es 404, igual que uno que no existe.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import type { SerialDetalle } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, idNumericoDeRuta, leerQuery, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/seriales/[id]';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    await leerQuery(ctx, req, z.object({}).strict(), RUTA);
    const id = await idNumericoDeRuta(routeParams);
    await exigirVer(ctx, RUTA);
    const detalle = await rpc<SerialDetalle>(ctx, 'fn_serial_detalle', { p_org: ctx.organizationId, p_id: id });
    return NextResponse.json(detalle, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
