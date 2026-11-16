/**
 * POST /api/hrm/ausencias/[id]/cancelar — { motivo? }
 *
 * El titular cancela lo solicitado o lo aprobado que aún no empieza; quien tiene
 * `hr.leaves.approve`, cualquiera. Anula la aprobación pendiente (ADR-002 §5).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cancelar } from '@/lib/services/hrm/ausenciasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ motivo?: unknown }>(ctx, req, { route: 'hrm/ausencias/cancelar' });
    return NextResponse.json(await cancelar(ctx, id, body?.motivo), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:cancelar');
  }
});
