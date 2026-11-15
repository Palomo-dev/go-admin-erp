/**
 * GET /api/hrm/personas/[id]/contactos — contactos de emergencia. Los ve RR. HH.
 * (identificación) y el jefe de su equipo (decisión 9), con registro de acceso.
 * Se editan por PUT /api/hrm/personas/[id]/datos/identificacion
 * ({ contactos_emergencia: [...] }), que exige hr.data.identificacion.edit.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { leerContactos } from '@/lib/services/hrm/personasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    return NextResponse.json(await leerContactos(ctx, await parametroDeRuta(routeParams, 'id'), contextoDePeticion(req)), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'contactos:leer');
  }
});
