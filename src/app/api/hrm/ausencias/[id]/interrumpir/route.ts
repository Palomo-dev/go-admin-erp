/**
 * POST /api/hrm/ausencias/[id]/interrumpir — { ultimo_dia, motivo }
 *
 * Interrumpe unas vacaciones aprobadas y devuelve los días hábiles no disfrutados (Figma 20.13,
 * menú de la fila). Solo `hr.leaves.approve`; lo valida la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { interrumpir } from '@/lib/services/hrm/ausenciasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/ausencias/interrumpir' });
    return NextResponse.json(await interrumpir(ctx, id, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:interrumpir');
  }
});
