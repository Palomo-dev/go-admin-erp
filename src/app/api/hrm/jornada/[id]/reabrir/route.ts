/**
 * POST /api/hrm/jornada/[id]/reabrir — { motivo }
 *
 * Saca un día de «lista para nómina» para corregirlo, mientras la nómina no lo
 * haya consumido (`locked`). Solo `hr.attendance.manage` (ADR-002 §4).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { reabrir } from '@/lib/services/hrm/jornadaService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ motivo?: unknown }>(ctx, req, { route: 'hrm/jornada/reabrir' });
    return NextResponse.json(await reabrir(ctx, id, body?.motivo), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'jornada:reabrir');
  }
});
