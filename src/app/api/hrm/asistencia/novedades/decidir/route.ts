/**
 * POST /api/hrm/asistencia/novedades/decidir — { instancias: uuid[], decision, comentario? }
 *
 * Aprueba o rechaza varias novedades (Figma 20.12.2–20.12.4). Cada una va por
 * `fn_hr_aprobacion_decidir` con la sesión del usuario: aprobador del paso o su
 * delegado, nunca lo propio. Rechazar exige motivo. Los ajustes de marca aprobados
 * se aplican con la hora pedida y su día se vuelve a clasificar.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { decidirNovedades } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, {
      route: 'hrm/asistencia/novedades/decidir',
    });
    return NextResponse.json(await decidirNovedades(ctx, body), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'asistencia:decidir');
  }
});
