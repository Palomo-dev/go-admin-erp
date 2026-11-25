/**
 * /api/sitio-web/tienda/ajustes-resenas — «Ajustes de reseñas» (Figma «16 Sitio web» 3131-92277).
 *
 * GET → origen de la tienda, moderar, quién escribe, fotos, correo «¿Qué te pareció tu compra?» y
 *       el remitente con que salen los correos (siempre el de la tienda).
 * PUT { moderar?, quienEscribe?, fotos?, correo?: { activo?, dias?, recordatorio? } } → guarda solo
 *       lo que viene en `website_settings` (fila principal). El origen se elige en el editor.
 *
 * Organización de la sesión (`withOrg` + `readOrgBody`) y permiso `website.sites.edit`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { guardarAjustesResenasTienda, leerAjustesResenasTienda, respuestaErrorTienda } from '@/lib/website/tiendaSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'sitio-web/tienda/ajustes-resenas';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    return NextResponse.json(await leerAjustesResenasTienda(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorTienda(error, RUTA, ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: RUTA });
    return NextResponse.json(await guardarAjustesResenasTienda(ctx, body), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorTienda(error, RUTA, ctx.organizationId);
  }
});
