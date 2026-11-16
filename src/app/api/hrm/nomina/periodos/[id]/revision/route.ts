/**
 * POST /api/hrm/nomina/periodos/[id]/revision
 *
 * Envía la preliquidación a revisión: con regla «cierre_nomina» la decide el motor de aprobaciones.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { enviarRevision } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/revision' });
    return NextResponse.json(await enviarRevision(ctx, await parametroDeRuta(rp, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/revision');
  }
});
