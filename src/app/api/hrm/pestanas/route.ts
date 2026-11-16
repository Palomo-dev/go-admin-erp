/**
 * GET /api/hrm/pestanas — qué pestañas de RR. HH. ve la persona (decisión 1:
 * RR. HH. 9, jefe 6) y sus contadores (empleados, equipo, novedades pendientes).
 * Lo decide la base con los permisos del actor; la UI solo dibuja.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { pestanas } from '@/lib/services/hrm/equipoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await pestanas(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'pestanas');
  }
});
