/**
 * GET /api/pos/propinas/liquidaciones/[id] — detalle de una liquidación
 * (`fn_propinas_liquidacion_detalle`): reparto, propinas incluidas, egreso de
 * caja, asientos e historial. La base comprueba organización y sucursal.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { detalleLiquidacion } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, puedeVerPropinas, respuestaErrorPropinas, sinPermiso } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  if (!(await puedeVerPropinas(ctx))) return sinPermiso();
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  try {
    return NextResponse.json(await detalleLiquidacion(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'GET /api/pos/propinas/liquidaciones/[id]', ctx.organizationId);
  }
});
