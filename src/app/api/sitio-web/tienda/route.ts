/**
 * /api/sitio-web/tienda — «Tienda» del sitio web (catálogo web, plantillas de
 * detalle y reseñas).
 *
 * GET → KPIs del catálogo, sedes con ocultos y agotados en la web, plantillas
 *       de detalle, reseñas pendientes y auto-aprobación.
 * PUT { autoAprobarResenas: boolean } → `website_settings.reviews_auto_approve`.
 *
 * El catálogo por sede se lee y escribe con `/api/website/carta-sede` (el
 * mismo motor de la carta por sede) y la moderación de reseñas con
 * `/api/sitio-web/tienda/resenas`: esta ruta no los duplica.
 *
 * Organización de la sesión (`withOrg` + `readOrgBody`); permiso
 * `website.sites.edit`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { ErrorTienda, guardarAutoAprobar, leerTiendaSitio, respuestaErrorTienda } from '@/lib/website/tiendaSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/tienda' });
    return NextResponse.json(await leerTiendaSitio(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorTienda(error, 'sitio-web/tienda', ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/tienda' })) as { autoAprobarResenas?: unknown } | null;
    if (!body || typeof body.autoAprobarResenas !== 'boolean') throw new ErrorTienda('peticion_invalida', 400, 'Se esperaba un sí o un no.');
    await guardarAutoAprobar(ctx, body.autoAprobarResenas);
    return NextResponse.json(await leerTiendaSitio(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorTienda(error, 'sitio-web/tienda', ctx.organizationId);
  }
});
