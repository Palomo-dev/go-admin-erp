import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { publicar } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';

/**
 * POST { version, nota? } → publica el borrador como revisión inmutable (`publish_site_revision`).
 * Idempotente con la misma versión. No activa V2 en la web pública: eso es `adoption` (D4).
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/publications' })) as {
      version?: unknown;
      nota?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null) return respuestaError('peticion_invalida', 'Se esperaba { version }.');
    if (body.nota !== undefined && body.nota !== null && typeof body.nota !== 'string') {
      return respuestaError('peticion_invalida', 'La nota debe ser texto.');
    }
    const nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim() : null;
    return NextResponse.json(await publicar(ctx.supabase, ctx.organizationId, sitioId, version, nota), { status: 201 });
  } catch (error) {
    return manejarError(error, 'POST publications');
  }
});
