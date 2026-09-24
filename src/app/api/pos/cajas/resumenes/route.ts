/**
 * GET /api/pos/cajas/resumenes?ids=12,15,18 — cifras de varias cajas para
 * «Cajas abiertas»: esperado y ventas en efectivo (`pos_caja_esperado`),
 * cobros en efectivo y movimientos. Una petición en lugar de un
 * `getCashSummary` por caja desde el navegador (R12 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). Con cierre ciego y sin
 * `pos.cajas.ver_esperado` no trae cifras de dinero.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ErrorResumenCaja, resumenesCompactos } from '@/lib/pos/cajas/resumenServidor';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  try {
    const resumenes = await resumenesCompactos(ctx, ids);
    return NextResponse.json({ resumenes }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof ErrorResumenCaja) {
      console.error('[pos/cajas/resumenes] lectura', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: 'No se pudieron leer las cajas', codigo: err.codigo }, { status: err.status });
    }
    throw err;
  }
});
