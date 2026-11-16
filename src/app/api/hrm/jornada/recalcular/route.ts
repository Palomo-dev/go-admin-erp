/**
 * POST /api/hrm/jornada/recalcular — { vinculo_id, desde, hasta? }
 *
 * Clasifica las horas del rango con el motor (ADR-002 §3) y sigue hasta el
 * domingo de la última semana, porque el tope semanal depende de los días
 * anteriores. Lo puede pedir el propio empleado o `hr.attendance.manage`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { recalcular } from '@/lib/services/hrm/jornadaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, esUuid } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ vinculo_id?: unknown; desde?: unknown; hasta?: unknown }>(ctx, req, {
      route: 'hrm/jornada/recalcular',
    });
    if (!esUuid(body?.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
    const dias = await recalcular(ctx, body.vinculo_id, String(body?.desde ?? ''), typeof body?.hasta === 'string' ? body.hasta : null);
    return NextResponse.json({ dias }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'jornada:recalcular');
  }
});
