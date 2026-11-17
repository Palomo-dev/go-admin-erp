/**
 * POST /api/hrm/marcacion/excepciones/[id] — { accion: 'revocar' }. Si seguía pendiente,
 * la solicitud de aprobación se anula. Solo `hr.attendance.manage` (lo comprueba la base).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { revocarExcepcion } from '@/lib/services/hrm/marcacionGestionService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ accion?: unknown }>(ctx, req, { route: 'hrm/marcacion/excepciones/accion' });
    if (body?.accion !== 'revocar') throw new HrmError(422, 'accion_invalida');
    return NextResponse.json(await revocarExcepcion(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:excepcion-revocar');
  }
});
