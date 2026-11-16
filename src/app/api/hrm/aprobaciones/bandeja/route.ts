/**
 * GET /api/hrm/aprobaciones/bandeja?estado=pendientes|resueltas — «Mis
 * aprobaciones» (Figma 20.7) con persona, solicitante, eventos y montos (solo a
 * quien tiene el permiso de salario de esa persona; la lectura queda registrada).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { bandeja } from '@/lib/services/hrm/aprobacionesBandeja.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const estado = new URL(req.url).searchParams.get('estado');
    return NextResponse.json(await bandeja(ctx, estado, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'aprobaciones:bandeja');
  }
});
