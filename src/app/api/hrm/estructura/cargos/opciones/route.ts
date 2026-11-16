/** GET /api/hrm/estructura/cargos/opciones → áreas, cargos, sedes y permisos para «Nuevo cargo». */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleCargo } from '@/lib/services/hrm/estructuraService.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    return NextResponse.json(await detalleCargo(ctx, null, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'estructura:cargos:opciones');
  }
});
