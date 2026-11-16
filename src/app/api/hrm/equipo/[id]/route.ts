/**
 * GET /api/hrm/equipo/[id] — una persona del equipo (Figma 20.15.3): estado de
 * hoy, turnos de la semana, vacaciones disponibles y horas del periodo. Sin
 * salario, banco ni salud; una incapacidad es «ausencia justificada».
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { personaDelEquipo } from '@/lib/services/hrm/equipoService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  try {
    return NextResponse.json(await personaDelEquipo(ctx, await parametroDeRuta(routeParams, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'equipo:persona');
  }
});
