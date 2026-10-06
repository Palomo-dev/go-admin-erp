import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { leerCategoriasMenu } from '@/lib/services/website/paginasSitioService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { sitioDeParametro } from '@/components/sitio-web/paginas/parametrosPaginas';

/**
 * GET ?sitio=principal|<branchId> → categorías del Inventario para Menú y navegación (Figma
 * A/04c y D/04-09), con los productos activos de cada una. El navegador no lee `categories`
 * directamente: la organización sale de la sesión.
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/paginas/menu/categorias' });
    const sitio = sitioDeParametro(new URL(request.url).searchParams.get('sitio'));
    if (sitio === 'invalido') return respuestaError('peticion_invalida', 'El parámetro sitio no es válido.');
    return NextResponse.json({ categorias: await leerCategoriasMenu(ctx, sitio) });
  } catch (error) {
    return manejarError(error, 'GET sitio-web/paginas/menu/categorias');
  }
});
