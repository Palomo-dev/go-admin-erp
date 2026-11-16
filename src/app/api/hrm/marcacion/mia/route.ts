/**
 * GET /api/hrm/marcacion/mia?desde=AAAA-MM-DD&hasta=AAAA-MM-DD — «Mi asistencia»
 * del empleado de la sesión (Figma 20.9.12): turno, entrada, descanso, salida,
 * horas, cómo marcó y si quedó para revisión. Solo lo propio.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { miAsistencia } from '@/lib/services/hrm/marcacionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await miAsistencia(ctx, { desde: q.get('desde'), hasta: q.get('hasta') }), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:mia');
  }
});
