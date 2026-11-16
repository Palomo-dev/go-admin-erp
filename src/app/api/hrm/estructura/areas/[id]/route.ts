/**
 * Recursos humanos › Áreas › un área.
 * PUT → guarda los cambios; DELETE → archiva (la base lo impide con personas
 * activas, plazas aprobadas o áreas hijas).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { archivarArea, guardarArea } from '@/lib/services/hrm/estructuraService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const PUT = withOrg(async (ctx, req, routeParams) => {
  try {
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/estructura/areas' });
    return NextResponse.json(await guardarArea(ctx, await parametroDeRuta(routeParams, 'id'), b ?? {}), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:areas:guardar');
  }
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/estructura/areas' });
    return NextResponse.json(await archivarArea(ctx, await parametroDeRuta(routeParams, 'id')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:areas:archivar');
  }
});
