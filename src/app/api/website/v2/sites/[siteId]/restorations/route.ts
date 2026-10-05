import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { restaurar } from '@/lib/services/website/siteDocumentService';
import { esUuid, manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';

/**
 * POST { revisionId, version } → copia la revisión al borrador como versión nueva. La revisión
 * no se edita nunca y lo publicado no cambia hasta volver a publicar.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/restorations' })) as {
      revisionId?: unknown;
      version?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null || !esUuid(body.revisionId)) {
      return respuestaError('peticion_invalida', 'Se esperaba { revisionId, version }.');
    }
    return NextResponse.json(await restaurar(ctx.supabase, ctx.organizationId, sitioId, body.revisionId, version));
  } catch (error) {
    return manejarError(error, 'POST restorations');
  }
});
