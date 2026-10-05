import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cambiarAdopcion } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError, sitioDeRuta } from '@/lib/website/v2/respuestasApi';

/**
 * POST { adoptado: boolean } → activa o desactiva V2 en la web pública de este sitio
 * (`set_site_v2_adoption`, ADR-002 D4). Activar exige una revisión publicada; desactivar
 * devuelve el principal a legacy sin borrar borradores ni revisiones.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/adoption' })) as { adoptado?: unknown };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    if (typeof body.adoptado !== 'boolean') return respuestaError('peticion_invalida', 'Se esperaba { adoptado: boolean }.');
    // Activar bloquea el guardado legacy; sin el lector público de V2 desplegado la web
    // quedaría congelada. Desactivar siempre se permite.
    if (body.adoptado && process.env.NEXT_PUBLIC_WEBSITE_V2_LECTOR !== '1') {
      return respuestaError('peticion_invalida', 'La web todavía no lee V2: activarlo se habilita cuando el lector público esté desplegado.');
    }
    return NextResponse.json({ sitio: await cambiarAdopcion(ctx.supabase, ctx.organizationId, sitioId, body.adoptado) });
  } catch (error) {
    return manejarError(error, 'POST adoption');
  }
});
