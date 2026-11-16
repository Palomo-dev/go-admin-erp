/**
 * GET /api/hrm/equipo — «Mi equipo» del jefe (Figma 20.15): su equipo directo e
 * indirecto, pendientes por aprobar, faltas y llegadas tarde de hoy y ausentes
 * de la semana. Sin salario, banco ni salud.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { miEquipo } from '@/lib/services/hrm/equipoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await miEquipo(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'equipo');
  }
});
