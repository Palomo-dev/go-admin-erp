import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { guardarBorrador, obtenerBorrador } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';

/**
 * Borrador del sitio V2 (FASE-03).
 *
 * GET → documento, versión, revisión base y, si es una sede, la base del principal (D6).
 * PUT { documento, version } → guarda con compare-and-swap. 409 si otra persona guardó o
 *     publicó antes; 422 si el documento no cumple el contrato.
 */
export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/draft' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    return NextResponse.json(await obtenerBorrador(ctx.supabase, ctx.organizationId, sitioId));
  } catch (error) {
    return manejarError(error, 'GET draft');
  }
});

export const PUT = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/draft' })) as {
      documento?: unknown;
      version?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null || body.documento === undefined) {
      return respuestaError('peticion_invalida', 'Se esperaba { documento, version }.');
    }
    return NextResponse.json(await guardarBorrador(ctx.supabase, ctx.organizationId, sitioId, body.documento, version));
  } catch (error) {
    return manejarError(error, 'PUT draft');
  }
});
