/**
 * GET /api/hrm/permisos — qué puede ver, ver de su equipo o editar en RR. HH.
 * el usuario de la sesión (ADR-001 §6). Lo resuelve la base; la UI solo lo usa
 * para mostrar u ocultar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { misPermisos } from '@/lib/services/hrm/permisosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await misPermisos(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'permisos');
  }
});
