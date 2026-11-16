/**
 * GET /api/hrm/asistencia/novedades?desde&hasta&sede= — novedades del período
 * (llegadas tarde, ausencias, horas extra, cambios de turno y ajustes de marca) con
 * quién puede decidir cada una y si el período ya está «lista para nómina» (Figma 20.12).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { novedades, sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await novedades(ctx, q.get('desde') ?? '', q.get('hasta') ?? '', sedeDeQuery(q.get('sede'))), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'asistencia:novedades');
  }
});
