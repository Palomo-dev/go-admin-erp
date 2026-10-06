import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarAlBorrador, type ResultadoOperacion } from '@/lib/services/website/paginasSitioService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  cambiarDireccion,
  duplicarPagina,
  eliminarPagina,
  fijarEnMenu,
  fijarPublicada,
  renombrarPagina,
} from '@/components/sitio-web/paginas/operacionesPagina';
import { esIdPagina, sitioDeCuerpo, versionDeCuerpo } from '@/components/sitio-web/paginas/parametrosPaginas';

/**
 * Una página del borrador (Figma A/04a, menú «⋯» de la fila y el interruptor «En el menú»).
 *
 * PATCH { sitio, version, accion, … } con `accion`:
 *   - `en_menu` { enMenu }: la pone o la quita del menú del encabezado.
 *   - `publicada` { publicada }: «Ocultar del sitio» / «Volver a publicar en el sitio».
 *   - `direccion` { slug }: cambia la dirección (única en el sitio).
 *   - `titulo` { titulo }: cambia el nombre.
 *   - `duplicar` { sufijo }: copia la página como «<nombre> (copia)».
 * DELETE { sitio, version }: elimina la página y sus enlaces en los menús (Inicio no se elimina).
 *
 * Todo escribe en el borrador con compare-and-swap (409 si alguien guardó antes).
 */
async function paginaDeRuta(routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined) {
  const params = routeParams ? await routeParams.params : {};
  return esIdPagina(params.paginaId) ? params.paginaId : null;
}

export const PATCH = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/paginas/[paginaId]' })) as Record<string, unknown>;
    const paginaId = await paginaDeRuta(routeParams);
    const sitio = sitioDeCuerpo(body.sitio);
    const version = versionDeCuerpo(body.version);
    if (!paginaId || sitio === 'invalido' || version === 'invalido') {
      return respuestaError('peticion_invalida', 'Se esperaba { sitio, version, accion }.');
    }
    let operar: ((documento: DocumentoSitio) => ResultadoOperacion) | null = null;
    switch (body.accion) {
      case 'en_menu':
        if (typeof body.enMenu === 'boolean') operar = (d) => fijarEnMenu(d, paginaId, body.enMenu as boolean, randomUUID);
        break;
      case 'publicada':
        if (typeof body.publicada === 'boolean') operar = (d) => fijarPublicada(d, paginaId, body.publicada as boolean);
        break;
      case 'direccion':
        if (typeof body.slug === 'string') operar = (d) => cambiarDireccion(d, paginaId, body.slug as string);
        break;
      case 'titulo':
        if (typeof body.titulo === 'string') operar = (d) => renombrarPagina(d, paginaId, body.titulo as string);
        break;
      case 'duplicar': {
        const sufijo = typeof body.sufijo === 'string' && body.sufijo.length <= 40 ? body.sufijo : '(copia)';
        operar = (d) => duplicarPagina(d, paginaId, sufijo, randomUUID);
        break;
      }
      default:
        break;
    }
    if (!operar) return respuestaError('peticion_invalida', 'La acción no es válida.');
    return NextResponse.json(await aplicarAlBorrador(ctx, sitio, version, operar));
  } catch (error) {
    return manejarError(error, 'PATCH sitio-web/paginas/[paginaId]');
  }
});

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/paginas/[paginaId]' })) as Record<string, unknown>;
    const paginaId = await paginaDeRuta(routeParams);
    const sitio = sitioDeCuerpo(body.sitio);
    const version = versionDeCuerpo(body.version);
    if (!paginaId || sitio === 'invalido' || version === 'invalido') {
      return respuestaError('peticion_invalida', 'Se esperaba { sitio, version }.');
    }
    return NextResponse.json(await aplicarAlBorrador(ctx, sitio, version, (d) => eliminarPagina(d, paginaId)));
  } catch (error) {
    return manejarError(error, 'DELETE sitio-web/paginas/[paginaId]');
  }
});
