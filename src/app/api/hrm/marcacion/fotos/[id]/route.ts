/**
 * GET /api/hrm/marcacion/fotos/[id] — enlace firmado (60 s) a la foto de evidencia
 * de una marca (plan de Marcación §5.2). La ven hr.attendance.view y el jefe
 * directo mientras haya un caso abierto; cada vista queda en hr_access_log.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { verFoto } from '@/lib/services/hrm/kioscoGestionService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    return NextResponse.json(await verFoto(ctx, id, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:foto');
  }
});
