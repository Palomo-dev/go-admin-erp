/**
 * GET /api/sitio-web/carta/vista-previa?branch_id&fecha=YYYY-MM-DD&hora=HH:MM
 * «Ver como» (F-flujos/1 paso 4): la carta que vería un cliente en esa sede a
 * esa hora. La hora se lee en la zona de la organización y se resuelve con la
 * MISMA RPC del sitio público (`get_public_menu`): no hay una segunda regla de
 * vigencia.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { respuestaErrorCarta, vistaPreviaCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/carta/vista-previa';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const q = new URL(request.url).searchParams;
    const sede = Number(q.get('branch_id'));
    const fecha = q.get('fecha');
    const hora = q.get('hora');
    return NextResponse.json(
      await vistaPreviaCarta(
        ctx,
        Number.isInteger(sede) && sede > 0 ? sede : null,
        fecha && FECHA.test(fecha) ? fecha : null,
        hora && HORA.test(hora) ? hora : null,
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
