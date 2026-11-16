/**
 * PUT /api/hrm/turnos/plantillas/[id] — cambia una, o solo la activa o pausa con
 * { activa }. Solo `hr.attendance.manage` (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { actualizarPlantilla } from '@/lib/services/hrm/plantillasTurnoService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const PUT = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/turnos/plantillas' });
    return NextResponse.json(await actualizarPlantilla(ctx, id, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:plantillas:cambiar');
  }
});
