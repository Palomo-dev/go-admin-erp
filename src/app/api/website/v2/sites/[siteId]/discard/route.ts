import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { descartarBorrador } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';

/**
 * POST { version } → «Descartar cambios» del editor: el borrador vuelve a la revisión publicada.
 * Compare-and-swap con `version` (409 si alguien guardó antes). La revisión publicada y la web
 * no cambian. La organización sale de la sesión (`withOrg`), nunca del body.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/discard' })) as { version?: unknown };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null) return respuestaError('peticion_invalida', 'Se esperaba { version }.');
    return NextResponse.json(await descartarBorrador(ctx.supabase, ctx.organizationId, sitioId, version));
  } catch (error) {
    return manejarError(error, 'POST discard');
  }
});
