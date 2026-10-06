import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { listarSitios } from '@/lib/services/website/siteDocumentService';
import { cambiarPublicacion, ErrorConfiguracion, leerConfiguracion } from '@/lib/website/configuracionSitio.server';
import { manejarError, respuestaError, sitioDeRuta } from '@/lib/website/v2/respuestasApi';

/**
 * POST { publicado: boolean } → despublica el sitio principal o lo vuelve a
 * mostrar en la web (Configuración › Zona de peligro, Figma B/12-02b). Es la
 * acción `useSitioV2().cambiarVisibilidad`, el mismo hook con el que el
 * Resumen, Diseño y el editor publican: no hay una segunda vía de publicación.
 *
 * La web pública hoy decide su visibilidad por `website_settings.is_published`
 * (ADR-002 D4: V2 aún no se adopta), así que este endpoint cambia ese dato con
 * `cambiarPublicacion`, que exige `website.sites.publish` en la base. Solo el
 * sitio principal (sin sede) se despublica; la organización sale de la sesión.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/visibilidad' })) as { publicado?: unknown };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    if (typeof body?.publicado !== 'boolean') return respuestaError('peticion_invalida', 'Se esperaba { publicado: boolean }.');
    const sitio = (await listarSitios(ctx.supabase, ctx.organizationId)).find((s) => s.id === sitioId);
    if (!sitio) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    if (sitio.branchId !== null) return respuestaError('peticion_invalida', 'Solo el sitio principal se despublica desde aquí.');
    await cambiarPublicacion(ctx, body.publicado);
    const { ajustes } = await leerConfiguracion(ctx);
    return NextResponse.json({ publicado: ajustes.publicado, publicadoEn: ajustes.publicadoEn });
  } catch (error) {
    if (error instanceof ErrorConfiguracion) {
      return respuestaError(error.status === 403 ? 'sin_permiso' : error.status === 404 ? 'sitio_no_encontrado' : 'peticion_invalida', error.message);
    }
    return manejarError(error, 'POST visibilidad');
  }
});
