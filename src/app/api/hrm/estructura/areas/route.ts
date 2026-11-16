/**
 * Recursos humanos › Áreas (Figma 20.1).
 * GET → organigrama con personas, plazas por sede, cargos y opciones del formulario.
 * POST → crea un área (permiso `hr.departments.manage`, lo resuelve la base).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cargarAreas, guardarArea } from '@/lib/services/hrm/estructuraService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await cargarAreas(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:areas');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/estructura/areas' });
    return NextResponse.json(await guardarArea(ctx, null, b ?? {}), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:areas:crear');
  }
});
