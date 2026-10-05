import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { listarRevisiones } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta } from '@/lib/website/v2/respuestasApi';

/** GET ?limite=30 → historial de versiones publicadas del sitio, la más reciente primero. */
export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/revisions' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const limite = Number(new URL(request.url).searchParams.get('limite') ?? '30');
    const revisiones = await listarRevisiones(ctx.supabase, ctx.organizationId, sitioId, Number.isFinite(limite) ? limite : 30);
    return NextResponse.json({ revisiones });
  } catch (error) {
    return manejarError(error, 'GET revisions');
  }
});
