/**
 * GET /api/sitio-web/analitica/pixeles/[tipo]/prueba — «Probar eventos» de un
 * píxel (Figma B/09-01): descarga la página de inicio del sitio PUBLICADO (host
 * resuelto en el servidor, nunca de la petición) y dice si carga el ID
 * guardado. No usa credenciales del proveedor: hoy no hay token de Meta Events
 * API ni de GA4 en `integration_credentials` (reportado); la lectura de los
 * últimos eventos recibidos queda para cuando Integraciones guarde ese token.
 */
import { NextResponse } from 'next/server';
import { withOrg, jsonError } from '@/lib/utils/orgContext';
import { puedeVerAnaliticaWeb } from '@/lib/navigation/capacidadesNav.server';
import { direccionDelSitio, esSinColumna, respuestaErrorSeo } from '@/components/sitio-web/seoanalitica/seo.server';
import { COLUMNA_PIXEL, descargar, esTipoPixel, paginaCargaId, type PruebaPixelRespuesta } from '@/components/sitio-web/seoanalitica/saludSitio';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, routeParams) => {
  try {
    if (!(await puedeVerAnaliticaWeb(ctx))) return jsonError(403, 'SIN_PERMISO', 'No tienes acceso a la analítica web');
    const tipo = routeParams ? (await routeParams.params).tipo : undefined;
    if (!esTipoPixel(tipo)) return jsonError(400, 'TIPO_INVALIDO');
    const fila = await ctx.supabase.from('website_settings').select(COLUMNA_PIXEL[tipo]).eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle();
    if (fila.error && !esSinColumna(fila.error)) throw fila.error;
    const id = fila.error ? null : (((fila.data as unknown as Record<string, string | null> | null)?.[COLUMNA_PIXEL[tipo]] ?? null) || null);
    const { host } = await direccionDelSitio(ctx);
    const responder = (resultado: PruebaPixelRespuesta['resultado']) =>
      NextResponse.json({ host, id, resultado } satisfies PruebaPixelRespuesta, { headers: { 'Cache-Control': 'private, no-store' } });
    if (!id) return responder('sin_id');
    if (!host) return responder('sin_host');
    const pagina = await descargar(`https://${host}/`, 8000);
    if (!pagina || pagina.estado < 200 || pagina.estado >= 300) return responder('sitio_no_responde');
    return responder(paginaCargaId(pagina.cuerpo, id) ? 'encontrado' : 'no_encontrado');
  } catch (error) {
    return respuestaErrorSeo(error, 'sitio-web/analitica/pixeles/prueba', ctx.organizationId);
  }
});
