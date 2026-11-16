/**
 * DELETE /api/hrm/nomina/novedades/[id]
 *
 * Anula una novedad mientras el período siga abierto.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { anularNovedad } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const DELETE = withOrg(async (ctx, req, rp) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/nomina/novedades/anular' });
    return NextResponse.json(await anularNovedad(ctx, await parametroDeRuta(rp, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:novedades/[id]');
  }
});
