import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { leerMenusSitio } from '@/lib/services/website/paginasSitioService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { sitioDeParametro } from '@/components/sitio-web/paginas/parametrosPaginas';

/**
 * GET ?sitio=principal|<branchId> → Menú y navegación (Figma A/04c, D/04-10): permisos resueltos
 * en el servidor, sedes que salen en la web, giro y, si el sitio aún no tiene borrador V2, el
 * documento de solo lectura (sitio actual importado o el del principal que hereda la sede). Los
 * cambios se guardan en el borrador con la API V2 (`useSitioV2`).
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/paginas/menu' });
    const sitio = sitioDeParametro(new URL(request.url).searchParams.get('sitio'));
    if (sitio === 'invalido') return respuestaError('peticion_invalida', 'El parámetro sitio no es válido.');
    return NextResponse.json(await leerMenusSitio(ctx, sitio));
  } catch (error) {
    return manejarError(error, 'GET sitio-web/paginas/menu');
  }
});
