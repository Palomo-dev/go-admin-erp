import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { exigirPermiso, respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';
import { getServiceClient } from '@/lib/supabase/server-service';
import { pasarelasConectadas } from '@/lib/services/pagos/consultaPasarela.server';
import { PERMISO_RECONSTRUIR, reconstruirPedido } from '@/lib/services/webOrders/pedidosManualesServer';

export const dynamic = 'force-dynamic';

/** GET — pasarelas de pago conectadas de la organización (para elegir en «Reconstruir»). */
export const GET = withOrg(async (ctx) => {
  try {
    await exigirPermiso(ctx, PERMISO_RECONSTRUIR);
    return NextResponse.json({ pasarelas: await pasarelasConectadas(getServiceClient(), ctx.organizationId) });
  } catch (e) {
    return respuestaError(e);
  }
});

/**
 * POST — reconstruye un pedido pagado: consulta el cobro en la pasarela (solo lectura), exige que
 * esté aprobado y que el monto coincida, y crea (o completa) el pedido sin duplicar.
 */
export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.organization_id !== undefined && Number(body.organization_id) !== ctx.organizationId) {
      console.warn('[web-orders/reconstruir] organization_id del body distinto al de la sesión', { sesion: ctx.organizationId });
      return NextResponse.json({ error: 'Organización no permitida', code: 'ORG_DISTINTA' }, { status: 403 });
    }
    return NextResponse.json(await reconstruirPedido(ctx, body));
  } catch (e) {
    return respuestaError(e);
  }
});
