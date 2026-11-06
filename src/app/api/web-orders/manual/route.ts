import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';
import { crearPedidoManual } from '@/lib/services/webOrders/pedidosManualesServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/web-orders/manual — pedido manual (tienda, cliente y productos) con el número de la
 * tienda `WO-{org}-…`, pendiente, y link de pago si la organización tiene Wompi o Bold.
 * La organización sale de la sesión; si el body trae otra, 403.
 */
export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.organization_id !== undefined && Number(body.organization_id) !== ctx.organizationId) {
      console.warn('[web-orders/manual] organization_id del body distinto al de la sesión', { sesion: ctx.organizationId });
      return NextResponse.json({ error: 'Organización no permitida', code: 'ORG_DISTINTA' }, { status: 403 });
    }
    return NextResponse.json(await crearPedidoManual(ctx, body));
  } catch (e) {
    return respuestaError(e);
  }
});
