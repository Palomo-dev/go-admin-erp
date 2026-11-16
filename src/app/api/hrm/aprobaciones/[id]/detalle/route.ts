/**
 * GET /api/hrm/aprobaciones/[id]/detalle — una solicitud con sus eventos, para
 * el diálogo de revisión (bandeja) y «Ver solicitud» (ficha). La ven quien la
 * pidió, sus aprobadores y quien gestiona aprobaciones. Decidir o retirar:
 * POST /api/hrm/aprobaciones/[id].
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { verSolicitud } from '@/lib/services/hrm/aprobacionesBandeja.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    return NextResponse.json(await verSolicitud(ctx, await parametroDeRuta(routeParams, 'id'), contextoDePeticion(req)), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'aprobaciones:detalle');
  }
});
