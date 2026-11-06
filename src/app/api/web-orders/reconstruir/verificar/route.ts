import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';
import { verificarCobro } from '@/lib/services/webOrders/pedidosManualesServer';

export const dynamic = 'force-dynamic';

/** POST — consulta el cobro y dice qué haría «Reconstruir», SIN escribir nada. */
export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.organization_id !== undefined && Number(body.organization_id) !== ctx.organizationId) {
      console.warn('[web-orders/reconstruir/verificar] organization_id del body distinto al de la sesión', { sesion: ctx.organizationId });
      return NextResponse.json({ error: 'Organización no permitida', code: 'ORG_DISTINTA' }, { status: 403 });
    }
    return NextResponse.json(await verificarCobro(ctx, body));
  } catch (e) {
    return respuestaError(e);
  }
});
