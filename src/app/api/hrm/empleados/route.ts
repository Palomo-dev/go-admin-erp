/**
 * GET /api/hrm/empleados — lista de empleados (Figma 20.2). La organización y
 * el alcance (toda la organización o su equipo) salen de la sesión; el número
 * de documento solo viaja a quien tiene el permiso de identificación, y esa
 * lectura queda en el registro de accesos.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { listarEmpleados } from '@/lib/services/hrm/personasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    return NextResponse.json(await listarEmpleados(ctx, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'empleados:listar');
  }
});
