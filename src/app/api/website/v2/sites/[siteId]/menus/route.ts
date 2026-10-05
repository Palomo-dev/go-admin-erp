import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { llevarMenuAlBorrador } from '@/lib/services/website/siteDocumentService';
import { esUuid, manejarError, respuestaError, sitioDeRuta, versionDe } from '@/lib/website/v2/respuestasApi';

/**
 * POST { menuId, version } → lleva un menú al borrador. En una sede, un menú del principal se
 * copia primero con `fn_website_copiar_menu_a_sede` (copia propia, ADR-002 D3).
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites/menus' })) as {
      menuId?: unknown;
      version?: unknown;
    };
    const sitioId = await sitioDeRuta(routeParams);
    if (!sitioId) return respuestaError('sitio_no_encontrado', 'El sitio no existe en esta organización.');
    const version = versionDe(body.version);
    if (version === null || !esUuid(body.menuId)) return respuestaError('peticion_invalida', 'Se esperaba { menuId, version }.');
    return NextResponse.json(await llevarMenuAlBorrador(ctx.supabase, ctx.organizationId, sitioId, body.menuId, version));
  } catch (error) {
    return manejarError(error, 'POST menus');
  }
});
