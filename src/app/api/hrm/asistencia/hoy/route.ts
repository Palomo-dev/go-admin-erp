/**
 * GET /api/hrm/asistencia/hoy?sede= — quién está, quién falta y quién llegó tarde hoy
 * (Figma 20.10.1). El alcance (toda la organización o el equipo del jefe) lo
 * resuelve `fn_hr_asistencia_hoy`; las incapacidades salen sin su tipo a quien no
 * tiene salud en toda la organización (decisión 2).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { hoy, sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await hoy(ctx, sedeDeQuery(q.get('sede'))), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'asistencia:hoy');
  }
});
