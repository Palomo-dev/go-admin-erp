/**
 * POST /api/reportes/cierres/[id]/reabrir — reabre un cierre firmado (y su
 * periodo contable si era mensual). El motivo es obligatorio y queda en el
 * cierre y en el historial (`fn_cierre_reabrir`).
 *
 * Permiso `accounting.reverse`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta, leerCuerpo } from '@/lib/services/compras/rutas.server';
import { reabrirCierreSchema } from '@/lib/services/reportes/contrato';
import { reabrirCierre } from '@/lib/services/reportes/cierres/cierres.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/reportes/cierres/[id]/reabrir';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const { motivo } = await leerCuerpo(ctx, req, reabrirCierreSchema, RUTA);
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['accounting.reverse'], RUTA);
    await exigirDeLaOrg(ctx, 'report_closings', id);
    const resultado = await reabrirCierre(ctx, id, motivo);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
