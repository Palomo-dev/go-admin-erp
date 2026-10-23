/**
 * GET /api/inventario/reportes/stock-sin-seriales — existencia de productos con
 * serial mayor que los seriales que la ocupan. La organización sale de la
 * sesión. El reporte solo lee: no crea seriales.
 */
import { NextResponse } from 'next/server';
import { readOrgBody } from '@/lib/security/organizationBody';
import type { FilaStockSinSerial } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';
import { withOrg } from '@/lib/utils/orgContext';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/reportes/stock-sin-seriales';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    await exigirVer(ctx, RUTA);
    const filas = await rpc<FilaStockSinSerial[]>(ctx, 'fn_reporte_stock_sin_seriales', { p_org: ctx.organizationId });
    return NextResponse.json({ filas: Array.isArray(filas) ? filas : [] }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
