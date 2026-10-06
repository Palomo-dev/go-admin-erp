/**
 * PATCH /api/sitio-web/carta/orden { ids } — orden de la lista de cartas
 * (Figma B/13-01: «Si dos cartas coinciden en hora y sede, se muestran como
 * pestañas en el orden de esta lista»). Un solo paso: `reordenar_cartas`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { esquemaOrdenCartas } from '@/lib/website/carta';
import { ErrorCarta, reordenarCartas, respuestaErrorCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/carta/orden';

export const PATCH = withOrg(async (ctx, request) => {
  try {
    const raw = (await readOrgBody(ctx, request, { route: RUTA })) as Record<string, unknown> | null;
    const r = esquemaOrdenCartas.safeParse({ ids: raw?.ids });
    if (!r.success) throw new ErrorCarta('peticion_invalida', 400, 'El orden de las cartas no es válido.');
    await reordenarCartas(ctx, r.data.ids);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
