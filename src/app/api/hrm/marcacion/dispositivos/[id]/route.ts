/**
 * POST /api/hrm/marcacion/dispositivos/[id] — { accion: 'regenerar' | 'activar' | 'desactivar' }.
 * Regenerar deja sin efecto la pantalla o la etiqueta anterior al instante. Solo
 * `hr.attendance.manage` (lo comprueba la base). Un punto nunca se borra.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { activarDispositivo, regenerarDispositivo } from '@/lib/services/hrm/marcacionGestionService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ accion?: unknown }>(ctx, req, { route: 'hrm/marcacion/dispositivos/accion' });
    if (body?.accion === 'regenerar') return NextResponse.json(await regenerarDispositivo(ctx, id), { headers: SIN_CACHE });
    if (body?.accion === 'activar' || body?.accion === 'desactivar') {
      return NextResponse.json(await activarDispositivo(ctx, id, body.accion === 'activar'), { headers: SIN_CACHE });
    }
    throw new HrmError(422, 'accion_invalida');
  } catch (err) {
    return responderError(err, 'marcacion:dispositivo-accion');
  }
});
