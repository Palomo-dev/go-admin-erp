/**
 * GET /api/hrm/asistencia/topes?desde&hasta&sede= — semanas por persona contra los
 * topes vigentes (horas extra al día y a la semana, jornada máxima) leídos con
 * `fn_hr_parametro` en la fecha de cada semana (Figma 20.11.3). Si falta un
 * parámetro vigente responde 422: no se inventa un valor.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { sedeDeQuery, topes } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await topes(ctx, q.get('desde') ?? '', q.get('hasta') ?? '', sedeDeQuery(q.get('sede'))), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'asistencia:topes');
  }
});
