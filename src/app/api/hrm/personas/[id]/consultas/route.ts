/**
 * GET /api/hrm/personas/[id]/consultas — «Últimas consultas» del salario y la
 * cuenta de la persona (decisión 8). Solo para quien tiene el permiso de
 * salario de esa persona o el de consultar el registro de accesos.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ultimasConsultas } from '@/lib/services/hrm/personasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  try {
    return NextResponse.json(
      { consultas: await ultimasConsultas(ctx, await parametroDeRuta(routeParams, 'id'), 5) },
      { headers: SIN_CACHE }
    );
  } catch (err) {
    return responderError(err, 'consultas:leer');
  }
});
