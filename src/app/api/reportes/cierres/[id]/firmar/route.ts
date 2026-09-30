/**
 * POST /api/reportes/cierres/[id]/firmar — firma un cierre emitido. El mensual
 * cierra además su periodo contable (`fiscal_periods`), dentro de la misma
 * RPC (`fn_cierre_firmar`), que vuelve a exigir el permiso y el alcance.
 *
 * Permiso `finance.approve`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirDeLaOrg, exigirPermisos, idDeRuta } from '@/lib/services/compras/rutas.server';
import { firmarCierre } from '@/lib/services/reportes/cierres/cierres.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'POST /api/reportes/cierres/[id]/firmar';

export const POST = withOrg(async (ctx, _req, routeParams) => {
  try {
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['finance.approve'], RUTA);
    await exigirDeLaOrg(ctx, 'report_closings', id);
    const resultado = await firmarCierre(ctx, id);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
