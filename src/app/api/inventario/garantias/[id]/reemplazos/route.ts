/**
 * GET /api/inventario/garantias/[id]/reemplazos — unidades del mismo producto
 * en stock para resolver el reclamo con un reemplazo.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import type { SerialReemplazo } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, leerQuery, respuestaError, rpc, uuidDeRuta } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/garantias/[id]/reemplazos';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    await leerQuery(ctx, req, z.object({}).strict(), RUTA);
    const id = await uuidDeRuta(routeParams);
    await exigirVer(ctx, RUTA);
    const seriales = await rpc<SerialReemplazo[]>(ctx, 'fn_garantia_reemplazos', { p_org: ctx.organizationId, p_id: id });
    return NextResponse.json({ seriales }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
