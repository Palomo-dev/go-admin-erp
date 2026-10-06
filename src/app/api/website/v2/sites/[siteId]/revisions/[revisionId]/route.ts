import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { obtenerRevision } from '@/lib/services/website/editorSitioService';
import { esUuid, manejarError, respuestaError, sitioDeRuta } from '@/lib/website/v2/respuestasApi';

export const dynamic = 'force-dynamic';

/**
 * GET → una versión publicada con su documento (Figma A/05h «Ver esta versión» y la base de
 * «Combinar» del conflicto, A/05i). Solo del sitio de la organización de la sesión; la RLS de
 * `website_site_revisions` exige además pertenencia activa.
 */
export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/revisions/[revisionId]' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const params = routeParams ? await routeParams.params : {};
    const revisionId = params.revisionId;
    if (!esUuid(revisionId)) return respuestaError('revision_no_encontrada', 'La versión no existe en este sitio.');
    const revision = await obtenerRevision(ctx.supabase, ctx.organizationId, sitioId, revisionId);
    return NextResponse.json({ revision }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return manejarError(error, 'GET revisions/[revisionId]');
  }
});
