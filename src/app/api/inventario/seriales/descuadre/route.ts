/**
 * GET /api/inventario/seriales/descuadre — unidades en stock sin serial (o al
 * revés) por producto y sede. No mueve inventario. Permiso de ver.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import type { DescuadreSerial } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, leerQuery, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/seriales/descuadre';

export const GET = withOrg(async (ctx, req) => {
  try {
    await leerQuery(ctx, req, z.object({}).strict(), RUTA);
    await exigirVer(ctx, RUTA);
    const data = await rpc<DescuadreSerial[] | null>(ctx, 'fn_seriales_descuadre', { p_org: ctx.organizationId });
    const filas = Array.isArray(data) ? data : [];
    return NextResponse.json({ filas }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
