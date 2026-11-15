/** GET /api/hrm/configuracion/accesos/[id] — detalle del registro, sin valores (diseño 10.RH.3). */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleRegistro } from '@/lib/services/hrm/configuracion/registroAccesosConfig.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  try {
    return NextResponse.json(await detalleRegistro(ctx, Number(await parametroDeRuta(routeParams, 'id'))), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:accesos:detalle');
  }
});
