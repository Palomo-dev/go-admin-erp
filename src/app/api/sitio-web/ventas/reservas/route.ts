/**
 * PUT /api/sitio-web/ventas/reservas { activo: boolean } — interruptor
 * «Mostrar «Reservar mesa» en el sitio» (Figma B/10-01): atajo del «Recibir
 * reservas en la web» de cada sede. La configuración completa vive en POS ›
 * Reservas de mesas › Configuración (B/P12 nota 1): aquí no se duplica.
 *
 * Organización de la sesión (`withOrg` + `readOrgBody`); permiso
 * `website.sites.edit`. Devuelve el tablero recalculado.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { ErrorVentas, alternarReservasWeb, leerVentasSitio, respuestaErrorVentas } from '@/lib/website/ventasSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/ventas/reservas' })) as { activo?: unknown } | null;
    if (!body || typeof body.activo !== 'boolean') throw new ErrorVentas('peticion_invalida', 400, 'Se esperaba un sí o un no.', ['activo']);
    await alternarReservasWeb(ctx, body.activo);
    return NextResponse.json(await leerVentasSitio(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorVentas(error, 'sitio-web/ventas/reservas', ctx.organizationId);
  }
});
