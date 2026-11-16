/**
 * POST /api/hrm/nomina/periodos/[id]/contabilizar
 *
 * Pasa a «contabilizado» si todas las colillas tienen su asiento de devengo y de pago; si no, dice cuáles faltan.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contabilizar } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/contabilizar' });
    return NextResponse.json(await contabilizar(ctx, await parametroDeRuta(rp, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/contabilizar');
  }
});
