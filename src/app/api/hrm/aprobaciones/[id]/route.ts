/**
 * POST /api/hrm/aprobaciones/[id] — { accion: 'aprobar' | 'rechazar' | 'cancelar', comentario? }
 *
 * La decisión va por la RPC transaccional (`fn_hr_aprobacion_decidir` /
 * `_cancelar`): comprueba aprobador o delegado vigente, impide aprobar lo
 * propio y aplica la consecuencia. Nunca un update suelto (ADR-001 §8).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cancelar, decidir } from '@/lib/services/hrm/aprobacionesService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const instancia = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ accion?: unknown; comentario?: unknown }>(ctx, req, { route: 'hrm/aprobaciones' });
    const comentario = typeof body?.comentario === 'string' ? body.comentario : null;
    if (body?.accion === 'cancelar') {
      return NextResponse.json(await cancelar(ctx, instancia, comentario), { headers: SIN_CACHE });
    }
    if (body?.accion !== 'aprobar' && body?.accion !== 'rechazar') throw new HrmError(422, 'decision_invalida');
    return NextResponse.json(await decidir(ctx, instancia, body.accion, comentario), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'aprobaciones:decidir');
  }
});
