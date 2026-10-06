import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { listarSitios } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta } from '@/lib/website/v2/respuestasApi';
import {
  DURACION_ENLACE_SEGUNDOS,
  firmarTokenVistaPrevia,
  secretoVistaPrevia,
} from '@/lib/website/v2/enlaceVistaPrevia';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const ID_PAGINA = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Enlace privado de la vista previa del borrador V2 (Figma «05 Editor», 1896:920550).
 *
 * POST { paginaId? } → { token, caducaEn }
 *
 * Solo para quien puede editar el sitio (`website.sites.edit`, comprobado en la base con
 * `fn_website_tiene_permiso` contra `auth.uid()`), y solo si el sitio es de la organización de la
 * sesión. El token lo verifica goadmin-websites (`/vista-previa/<token>`). Sin
 * `WEBSITE_PREVIEW_SECRET` responde 503: no se emite nada sin firma.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/vista-previa' })) as { paginaId?: unknown } | null;
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');

    const secreto = secretoVistaPrevia();
    if (!secreto) {
      console.error('[api/website/v2] vista-previa: falta WEBSITE_PREVIEW_SECRET (o tiene menos de 32 caracteres)');
      return NextResponse.json(
        { error: { code: 'error_interno', message: 'La vista previa del borrador no está configurada.' } },
        { status: 503, headers: SIN_CACHE },
      );
    }

    const { data: puede, error: errorPermiso } = await ctx.supabase.rpc('fn_website_tiene_permiso', {
      p_org: ctx.organizationId,
      p_code: 'website.sites.edit',
    });
    if (errorPermiso) throw errorPermiso;
    if (puede !== true) return respuestaError('sin_permiso', 'No tienes permiso para ver el borrador de este sitio.');

    const sitio = (await listarSitios(ctx.supabase, ctx.organizationId)).find((s) => s.id === sitioId);
    if (!sitio || sitio.versionBorrador === null) {
      return respuestaError('sitio_no_encontrado', 'El sitio no tiene borrador en esta organización.');
    }

    const paginaId = typeof body?.paginaId === 'string' && ID_PAGINA.test(body.paginaId) ? body.paginaId : null;
    const origen = new URL(request.url).origin;
    const caducaEn = Math.floor(Date.now() / 1000) + DURACION_ENLACE_SEGUNDOS;
    const token = firmarTokenVistaPrevia(
      {
        v: 1,
        o: ctx.organizationId,
        s: sitio.id,
        e: caducaEn,
        r: paginaId ? `${origen}/organizacion/branding/editor/${paginaId}` : `${origen}/app/organizacion/branding`,
      },
      secreto,
    );
    return NextResponse.json({ token, caducaEn: new Date(caducaEn * 1000).toISOString() }, { headers: SIN_CACHE });
  } catch (error) {
    return manejarError(error, 'POST vista-previa');
  }
});
