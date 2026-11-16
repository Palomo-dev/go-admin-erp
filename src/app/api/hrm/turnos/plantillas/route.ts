/**
 * GET  /api/hrm/turnos/plantillas — plantillas de turno de la organización.
 * POST /api/hrm/turnos/plantillas — crea una (solo `hr.attendance.manage`, por RLS).
 *
 * Cliente de la sesión: la RLS decide quién lee y quién escribe.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { crearPlantilla, listarPlantillas } from '@/lib/services/hrm/plantillasTurnoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await listarPlantillas(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:plantillas');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/turnos/plantillas' });
    return NextResponse.json(await crearPlantilla(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:plantillas:crear');
  }
});
