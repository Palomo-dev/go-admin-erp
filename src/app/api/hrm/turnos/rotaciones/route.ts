/**
 * GET  /api/hrm/turnos/rotaciones — rotaciones de turno de la organización.
 * POST /api/hrm/turnos/rotaciones — crea una (solo `hr.attendance.manage`, por RLS).
 *
 * Cliente de la sesión: la RLS decide quién lee y quién escribe.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { crearRotacion, listarRotaciones } from '@/lib/services/hrm/plantillasTurnoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await listarRotaciones(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:rotaciones');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/turnos/rotaciones' });
    return NextResponse.json(await crearRotacion(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:rotaciones:crear');
  }
});
