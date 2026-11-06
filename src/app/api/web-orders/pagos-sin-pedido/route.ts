import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';
import { pagosSinPedido } from '@/lib/services/webOrders/pedidosManualesServer';

export const dynamic = 'force-dynamic';

/** GET ?dias=90 — cobros aprobados de las pasarelas conectadas que no tienen pedido. */
export const GET = withOrg(async (ctx, req) => {
  try {
    const dias = Number(new URL(req.url).searchParams.get('dias') ?? 90);
    return NextResponse.json({ pagos: await pagosSinPedido(ctx, { dias }) });
  } catch (e) {
    return respuestaError(e);
  }
});
