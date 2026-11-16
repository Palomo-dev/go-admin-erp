/**
 * POST /api/hrm/nomina/ajustes/[id]/cerrar
 *
 * Cierra un ajuste: sus colillas quedan aprobadas y se asientan. `hr.payroll.close` y nómina habilitada.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { cerrarAjuste } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/ajustes/cerrar' });
    return NextResponse.json(await cerrarAjuste(ctx, await parametroDeRuta(rp, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:ajustes/[id]/cerrar');
  }
});
