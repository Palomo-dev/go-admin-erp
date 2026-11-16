/**
 * DELETE /api/hrm/turnos/[id] — quita un turno. Un borrador que nunca se publicó
 * se borra; uno publicado queda cancelado en borrador y el cambio se avisa al
 * volver a publicar. Solo `hr.attendance.manage`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { quitarTurno } from '@/lib/services/hrm/turnosService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const DELETE = withOrg(async (ctx, _req, routeParams) => {
  try {
    return NextResponse.json(await quitarTurno(ctx, await parametroDeRuta(routeParams, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:quitar');
  }
});
