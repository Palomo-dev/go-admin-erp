/**
 * GET /api/hrm/ausencias/[id]/salud — diagnóstico y entidad de una incapacidad.
 *
 * Grupo «salud» (ADR-002 §6): lo ve el titular o quien tiene `hr.data.salud.view`
 * en toda la organización (el alcance de equipo está bloqueado para salud). Cada
 * lectura queda en `hr_access_log` con la IP original; el intento sin permiso, también.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleSalud } from '@/lib/services/hrm/ausenciasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    return NextResponse.json(await detalleSalud(ctx, id, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:salud');
  }
});
