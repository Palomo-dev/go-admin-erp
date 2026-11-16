/**
 * GET /api/hrm/asistencia/hojas?desde&hasta&sede= — hojas de tiempo del período por
 * persona (Figma 20.10.3): programadas, trabajadas, extra, nocturnas, dominicales y
 * festivas, ajustes por aprobar y estado. Horas, nunca pesos.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { hojas, sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await hojas(ctx, q.get('desde') ?? '', q.get('hasta') ?? '', sedeDeQuery(q.get('sede'))), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'asistencia:hojas');
  }
});
