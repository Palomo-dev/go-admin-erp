/**
 * /api/sitio-web/seo — «SEO y redes» (Figma B/08-01…08-05).
 *
 * GET → permisos, dirección pública (dominio principal verificado o subdominio,
 *       `direccionSitio`), código de Search Console, «Ocultar de los
 *       buscadores», cuántos productos tienen descripción y los datos del
 *       negocio para la sugerencia de «primera vez».
 * PUT { verificacionGoogle?: string | null, ocultarBuscadores?: boolean }
 *     → `website_settings` del sitio principal.
 *
 * Título, descripción, imagen y redes NO pasan por aquí: viven en el borrador
 * V2 y se guardan con `useSitioV2` (compare-and-swap por versión).
 *
 * La organización sale de la sesión (`withOrg`); otra en el body o la query →
 * 403 y registro (`readOrgBody`). Permiso `website.sites.edit` resuelto en la
 * base (`fn_website_tiene_permiso`).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { ErrorSeo, guardarAjustesServidor, leerSeoServidor, respuestaErrorSeo } from '@/components/sitio-web/seoanalitica/seo.server';
import { extraerCodigoVerificacion } from '@/components/sitio-web/seoanalitica/seoLogica';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/seo' });
    return NextResponse.json(await leerSeoServidor(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSeo(error, 'sitio-web/seo', ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/seo' })) as { verificacionGoogle?: unknown; ocultarBuscadores?: unknown } | null;
    const cambios: Record<string, string | boolean | null> = {};
    if (body && 'verificacionGoogle' in body) {
      if (body.verificacionGoogle !== null && typeof body.verificacionGoogle !== 'string') {
        throw new ErrorSeo('peticion_invalida', 400, 'El código de verificación no es válido.');
      }
      const codigo = extraerCodigoVerificacion(body.verificacionGoogle ?? '');
      if (codigo === undefined) throw new ErrorSeo('peticion_invalida', 400, 'Ese código no parece de Search Console.');
      cambios.google_site_verification = codigo;
    }
    if (body && 'ocultarBuscadores' in body) {
      if (typeof body.ocultarBuscadores !== 'boolean') throw new ErrorSeo('peticion_invalida', 400, 'Se esperaba un sí o un no.');
      cambios.search_noindex = body.ocultarBuscadores;
    }
    await guardarAjustesServidor(ctx, cambios);
    return NextResponse.json(await leerSeoServidor(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSeo(error, 'sitio-web/seo', ctx.organizationId);
  }
});
