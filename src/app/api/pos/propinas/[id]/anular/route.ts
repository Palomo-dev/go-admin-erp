/**
 * POST /api/pos/propinas/[id]/anular — anula una propina por liquidar con
 * motivo obligatorio (`fn_propina_anular`: contra-asiento y permiso
 * `pos.void`, comprobados en la base). Body: `{ motivo }`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { anularPropina } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, respuestaErrorPropinas } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  const body = await readOrgBody<{ motivo?: unknown }>(ctx, req, { route: 'POST /api/pos/propinas/[id]/anular' });
  try {
    return NextResponse.json(await anularPropina(ctx, id, body?.motivo), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'POST /api/pos/propinas/[id]/anular', ctx.organizationId);
  }
});
