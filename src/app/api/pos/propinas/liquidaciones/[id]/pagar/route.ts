/**
 * POST /api/pos/propinas/liquidaciones/[id]/pagar — paga una liquidación «por
 * pagar» (`fn_propinas_liquidacion_pagar`): Débito 28150502 / Crédito caja o
 * bancos, un asiento por trabajador; en efectivo, con su egreso de caja.
 * Permiso `pos.propinas.liquidar` en la base.
 * Body: `{ solicitud, medio: 'efectivo' | 'transferencia', personas?, referencias? }`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { pagarLiquidacion, validarDatosPago } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, respuestaErrorPropinas } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  const body = await readOrgBody<unknown>(ctx, req, { route: 'POST /api/pos/propinas/liquidaciones/[id]/pagar' });
  try {
    return NextResponse.json(await pagarLiquidacion(ctx, id, validarDatosPago(body)), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'POST /api/pos/propinas/liquidaciones/[id]/pagar', ctx.organizationId);
  }
});
