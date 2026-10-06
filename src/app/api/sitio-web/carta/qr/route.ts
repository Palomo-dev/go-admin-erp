/**
 * GET /api/sitio-web/carta/qr?branch_id= — Carta QR (Figma B/13-03): mesas de
 * la sede (las de POS › Mesas, `restaurant_tables`) con la URL de su QR, que
 * arma `urlQrMesa` sobre el host público del sitio (el mismo contrato que lee
 * goadmin-websites: `/menu?mesa=<id>`).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { mesasQr, respuestaErrorCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/carta/qr';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const crudo = Number(new URL(request.url).searchParams.get('branch_id'));
    return NextResponse.json(await mesasQr(ctx, Number.isInteger(crudo) && crudo > 0 ? crudo : null), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
