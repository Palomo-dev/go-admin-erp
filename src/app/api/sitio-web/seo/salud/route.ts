/**
 * GET /api/sitio-web/seo/salud — salud del sitio en solo lectura (Figma B/08-01,
 * nota-ux 4): sitemap.xml, robots.txt y dirección canónica del sitio PUBLICADO.
 *
 * El host sale del servidor (`direccionSitio`: dominio principal verificado o
 * subdominio), nunca de la petición: así no se puede usar para pedir otra URL.
 * Solo se descargan /sitemap.xml y /robots.txt de ese host, con tiempo límite.
 * Caché de 5 min por organización: el botón «Actualizar» pide `?fresco=1`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { ErrorSeo, direccionDelSitio, respuestaErrorSeo } from '@/components/sitio-web/seoanalitica/seo.server';
import { descargar, leerRobots, leerSitemap, type SaludSeoRespuesta } from '@/components/sitio-web/seoanalitica/saludSitio';

export const dynamic = 'force-dynamic';

const TTL_MS = 5 * 60_000;
const cache = new Map<number, { hasta: number; valor: SaludSeoRespuesta }>();

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/seo/salud' });
    const permisos = await permisosSitio(ctx);
    if (!permisos.editar) throw new ErrorSeo('sin_permiso', 403, 'No tienes permiso para editar el SEO.');
    const fresco = new URL(request.url).searchParams.get('fresco') === '1';
    const guardado = cache.get(ctx.organizationId);
    if (!fresco && guardado && guardado.hasta > Date.now()) return NextResponse.json(guardado.valor);

    const { host } = await direccionDelSitio(ctx);
    let valor: SaludSeoRespuesta = { host, sitemap: null, robots: null, revisadoEn: new Date().toISOString() };
    if (host) {
      const [s, r] = await Promise.all([descargar(`https://${host}/sitemap.xml`), descargar(`https://${host}/robots.txt`)]);
      valor = {
        host,
        sitemap: s ? leerSitemap(s.estado, s.cuerpo) : { publicado: false, direcciones: 0 },
        robots: r ? leerRobots(r.estado, r.cuerpo) : { publicado: false, bloqueaTodo: false, rutasBloqueadas: [] },
        revisadoEn: new Date().toISOString(),
      };
    }
    if (cache.size > 500) cache.clear();
    cache.set(ctx.organizationId, { hasta: Date.now() + TTL_MS, valor });
    return NextResponse.json(valor, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorSeo(error, 'sitio-web/seo/salud', ctx.organizationId);
  }
});
