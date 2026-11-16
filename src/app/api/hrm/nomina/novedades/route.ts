/**
 * POST /api/hrm/nomina/novedades — { periodo_id, vinculo_id, concepto, valor?, cantidad?, descripcion? }
 *
 * Novedad de nómina (bonos, auxilios, descuentos autorizados, vacaciones compensadas). Con regla
 * «novedad_nomina» queda pendiente de aprobación y bloquea el cierre.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { registrarNovedad } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/nomina/novedades' });
    return NextResponse.json(await registrarNovedad(ctx, body ?? {}), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:novedades');
  }
});
