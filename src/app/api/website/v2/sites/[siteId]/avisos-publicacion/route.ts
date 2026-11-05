import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { avisosDePublicacion } from '@/lib/services/website/avisosPublicacionService';
import { manejarError, respuestaError, sitioDeRuta } from '@/lib/website/v2/respuestasApi';

/**
 * Revisión antes de publicar (Figma «16 Sitio web» 2264:51434, lámina 16).
 *
 * GET → { avisos: [{ clave, estado: 'ok' | 'aviso', valores }] }: plano de mesas por zona,
 *     reservas activas, precios por sede y fotos de la portada. No bloquea la publicación. Se
 *     calcula con el borrador guardado y los datos del ERP; la organización sale de la sesión.
 */
export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites/avisos-publicacion' });
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const avisos = await avisosDePublicacion(ctx.supabase, ctx.organizationId, sitioId);
    return NextResponse.json({ avisos }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return manejarError(error, 'GET avisos-publicacion');
  }
});
