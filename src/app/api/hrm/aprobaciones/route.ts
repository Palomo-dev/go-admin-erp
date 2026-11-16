/**
 * GET /api/hrm/aprobaciones — lo que el usuario de la sesión tiene que decidir,
 * incluido lo que le llega por una delegación vigente (ADR-001 §8).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { pendientes } from '@/lib/services/hrm/aprobacionesService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json({ pendientes: await pendientes(ctx) }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'aprobaciones:pendientes');
  }
});
