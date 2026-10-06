import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarAlBorrador, errorPagina, leerVistaPaginas } from '@/lib/services/website/paginasSitioService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { crearPaginaDesdePlantilla } from '@/components/sitio-web/paginas/operacionesPagina';
import { plantillaPorId } from '@/components/sitio-web/paginas/plantillasPagina';
import { sitioDeCuerpo, sitioDeParametro, versionDeCuerpo } from '@/components/sitio-web/paginas/parametrosPaginas';

/**
 * Páginas del sitio (Figma A/04a-04g).
 *
 * GET ?sitio=principal|<branchId> → filas de la tabla (estado, en el menú, legal, SEO,
 *     actualizada), contadores de las pestañas, permisos resueltos en el servidor
 *     (`website.sites.edit` / `website.sites.publish`), giro y sedes que salen en la web.
 * POST { sitio, version, plantilla, titulo, slug, enMenu } → crea la página desde una plantilla
 *     en el BORRADOR (A/04b). No cambia la web pública: publicar se hace desde Resumen o el editor.
 *
 * La organización sale de la sesión (`withOrg`); otra organización en el body o la query → 403
 * (`readOrgBody`).
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/paginas' });
    const sitio = sitioDeParametro(new URL(request.url).searchParams.get('sitio'));
    if (sitio === 'invalido') return respuestaError('peticion_invalida', 'El parámetro sitio no es válido.');
    return NextResponse.json(await leerVistaPaginas(ctx, sitio));
  } catch (error) {
    return manejarError(error, 'GET sitio-web/paginas');
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/paginas' })) as {
      sitio?: unknown;
      version?: unknown;
      plantilla?: unknown;
      titulo?: unknown;
      slug?: unknown;
      enMenu?: unknown;
    };
    const sitio = sitioDeCuerpo(body.sitio);
    const version = versionDeCuerpo(body.version);
    if (sitio === 'invalido' || version === 'invalido' || typeof body.titulo !== 'string' || typeof body.slug !== 'string') {
      return respuestaError('peticion_invalida', 'Se esperaba { sitio, version, plantilla, titulo, slug, enMenu }.');
    }
    const plantilla = typeof body.plantilla === 'string' ? plantillaPorId(body.plantilla) : undefined;
    if (!plantilla) throw errorPagina('plantilla_no_existe');
    const { titulo, slug } = body;
    const resultado = await aplicarAlBorrador(ctx, sitio, version, (documento) =>
      crearPaginaDesdePlantilla(documento, plantilla, { titulo, slug, enMenu: body.enMenu === true }, randomUUID),
    );
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return manejarError(error, 'POST sitio-web/paginas');
  }
});
