/**
 * POST /api/hrm/estructura/cargos/[id]/impacto → con la escala propuesta,
 * cuántas personas del cargo quedarían por debajo del mínimo o por encima del
 * máximo en cada sede. Lee salarios: exige el permiso y queda en el registro.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { impactoEscala } from '@/lib/services/hrm/estructuraService.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const b = await readOrgBody<{ filas?: unknown }>(ctx, req, { route: 'hrm/estructura/cargos/impacto' });
    return NextResponse.json(await impactoEscala(ctx, await parametroDeRuta(routeParams, 'id'), b?.filas, contextoDePeticion(req)), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'estructura:cargo:impacto');
  }
});
