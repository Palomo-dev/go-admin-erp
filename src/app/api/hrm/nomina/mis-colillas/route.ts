/**
 * GET /api/hrm/nomina/mis-colillas
 *
 * Las colillas cerradas del propio empleado. Las lee con su sesión: la RLS solo deja ver esas.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { misColillas } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json({ colillas: await misColillas(ctx) }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:mis-colillas');
  }
});
