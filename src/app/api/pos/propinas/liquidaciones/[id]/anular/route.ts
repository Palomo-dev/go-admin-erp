/**
 * POST /api/pos/propinas/liquidaciones/[id]/anular — anula una liquidación con
 * motivo obligatorio (`fn_propinas_liquidacion_anular`): devuelve el efectivo
 * a la caja con un ingreso, revierte el asiento si lo hubo y deja las propinas
 * otra vez por liquidar. Permisos `pos.propinas.liquidar` y `pos.void` en la
 * base. Body: `{ motivo }`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { anularLiquidacion } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, respuestaErrorPropinas } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  const body = await readOrgBody<{ motivo?: unknown }>(ctx, req, { route: 'POST /api/pos/propinas/liquidaciones/[id]/anular' });
  try {
    return NextResponse.json(await anularLiquidacion(ctx, id, body?.motivo), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'POST /api/pos/propinas/liquidaciones/[id]/anular', ctx.organizationId);
  }
});
