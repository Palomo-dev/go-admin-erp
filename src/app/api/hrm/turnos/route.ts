/**
 * Programación de turnos (Figma 20.8).
 *
 * GET  /api/hrm/turnos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&sede=N → personas,
 *      turnos, ausencias (salud enmascarada), festivos y plantillas del rango.
 *      Quien gestiona asistencia ve los borradores; el jefe, lo publicado de su equipo.
 * POST /api/hrm/turnos — { employment_id, fecha, plantilla_id? | hora_inicio + hora_fin,
 *      descanso_min?, dia_descanso? } → crea o cambia el turno, en borrador.
 *
 * La organización y el actor salen de la sesión; los permisos los decide la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { guardarTurno, semana } from '@/lib/services/hrm/turnosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    const sede = Number(q.get('sede'));
    return NextResponse.json(
      await semana(ctx, { desde: q.get('desde'), hasta: q.get('hasta'), sede: Number.isInteger(sede) && sede > 0 ? sede : undefined }),
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'turnos:semana');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/turnos' });
    return NextResponse.json(await guardarTurno(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'turnos:guardar');
  }
});
