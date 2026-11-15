/**
 * Recursos humanos › Cargos › un cargo.
 * GET → perfil, competencias, documentos, plazas por sede y, con el permiso de
 * salario, la escala por sede con su historial (lectura registrada).
 * PUT → guarda el cargo; la escala nueva cierra la vigente el día anterior.
 * DELETE → «Eliminar cargo»: queda inactivo (sin personas activas ni plazas aprobadas).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { detalleCargo, eliminarCargo, guardarCargo } from '@/lib/services/hrm/estructuraService.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    return NextResponse.json(await detalleCargo(ctx, await parametroDeRuta(routeParams, 'id'), contextoDePeticion(req)), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'estructura:cargo');
  }
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  try {
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/estructura/cargos' });
    return NextResponse.json(await guardarCargo(ctx, await parametroDeRuta(routeParams, 'id'), b ?? {}, contextoDePeticion(req)), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'estructura:cargo:guardar');
  }
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/estructura/cargos' });
    return NextResponse.json(await eliminarCargo(ctx, await parametroDeRuta(routeParams, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:cargo:eliminar');
  }
});
