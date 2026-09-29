/**
 * GET /api/inventario/distribucion/ordenes?origen= — órdenes de producción
 * completadas en la sucursal de origen con lo producido, lo ya distribuido, lo
 * disponible y lo que falta por distribuir (fn_distribucion_ordenes; `ver`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import type { OrdenDistribuible } from '@/lib/inventario/transferencias/contrato';
import { SIN_CACHE, leerQuery, respuestaError, rpc } from '@/lib/inventario/transferencias/rutas.server';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ origen: z.coerce.number().int().positive().max(2_147_483_647) });

export const GET = withOrg(async (ctx, req) => {
  const RUTA = 'GET /api/inventario/distribucion/ordenes';
  try {
    const q = await leerQuery(ctx, req, querySchema, RUTA);
    const ordenes = await rpc<OrdenDistribuible[]>(ctx, 'fn_distribucion_ordenes', { p_org: ctx.organizationId, p_origen: q.origen });
    return NextResponse.json(ordenes, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
