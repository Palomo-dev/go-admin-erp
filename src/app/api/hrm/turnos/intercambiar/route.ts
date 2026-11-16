/**
 * POST /api/hrm/turnos/intercambiar — { a, b }: «Cambiar con otra persona» en el
 * planificador. Los dos turnos son del mismo día; quedan en borrador.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { intercambiar } from '@/lib/services/hrm/turnosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ a?: unknown; b?: unknown }>(ctx, req, { route: 'hrm/turnos/intercambiar' });
    return NextResponse.json(await intercambiar(ctx, body?.a, body?.b), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:intercambiar');
  }
});
