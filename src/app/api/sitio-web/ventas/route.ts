/**
 * GET /api/sitio-web/ventas — tablero «Ventas en línea» (Figma B/10-01…10-05):
 * estado real por tarjeta (checkout, pagos, envíos, cupones, pedidos online,
 * reservas web y pasarela), conteo «N de M listos para vender», ajustes del
 * checkout para su diálogo, moneda y zona horaria de la organización.
 *
 * La organización sale de la sesión (`withOrg`); otra en la query → 403 y
 * registro (`readOrgBody`). Permiso `website.sites.edit` resuelto en la base.
 * Una tarjeta que no se pudo leer vuelve como `{ tema, error: true }`: la
 * respuesta no falla entera (B/10-03).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { leerVentasSitio, respuestaErrorVentas } from '@/lib/website/ventasSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/ventas' });
    return NextResponse.json(await leerVentasSitio(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorVentas(error, 'sitio-web/ventas', ctx.organizationId);
  }
});
