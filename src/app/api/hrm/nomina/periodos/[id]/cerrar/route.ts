/**
 * POST /api/hrm/nomina/periodos/[id]/cerrar
 *
 * Cierra el período: sin bloqueos, con la revisión aprobada y con la nómina habilitada. `hr.payroll.close`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { cerrar } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/cerrar' });
    return NextResponse.json(await cerrar(ctx, await parametroDeRuta(rp, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/cerrar');
  }
});
