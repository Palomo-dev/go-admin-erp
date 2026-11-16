/**
 * Recursos humanos › Cargos (Figma 20.1).
 * GET ?sede= → lista con nivel, personas, plazas y documentos; la escala de la
 * sede solo sale con el permiso de salario, y esa lectura queda en el registro.
 * POST → crea un cargo (con su escala, si llega y hay permiso de salario).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cargarCargos, guardarCargo } from '@/lib/services/hrm/estructuraService.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const sede = Number(new URL(req.url).searchParams.get('sede'));
    return NextResponse.json(await cargarCargos(ctx, Number.isInteger(sede) && sede > 0 ? sede : null, contextoDePeticion(req)), {
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'estructura:cargos');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/estructura/cargos' });
    return NextResponse.json(await guardarCargo(ctx, null, b ?? {}, contextoDePeticion(req)), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:cargos:crear');
  }
});
