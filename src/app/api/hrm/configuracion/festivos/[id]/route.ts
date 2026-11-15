/** DELETE /api/hrm/configuracion/festivos/[id] — quita un día propio de la empresa. */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { quitarDiaPropio } from '@/lib/services/hrm/configuracion/festivosConfig.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/configuracion/festivos' });
    await quitarDiaPropio(ctx, await parametroDeRuta(routeParams, 'id'));
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:festivos:quitar');
  }
});
