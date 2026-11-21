import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarAlBorrador } from '@/lib/services/website/paginasSitioService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { versionDeCuerpo } from '@/components/sitio-web/paginas/parametrosPaginas';
import { crearPaginaDetalle, esTipoPaginaDetalle } from '@/components/sitio-web/paginas/paginasDetalle';

/**
 * POST { tipo: 'product_detail' | 'category_detail', version } → «Crear ficha editable» /
 * «Crear página editable» de Tienda › Plantillas (Figma 2700:57498). Agrega al BORRADOR del sitio
 * principal la página de detalle con sus bloques por defecto y devuelve su id para abrir el editor.
 * Se ve en la web al publicar. Si ya existe no la duplica.
 *
 * Organización de la sesión (`withOrg` + `readOrgBody`); permiso «Editar sitio web» y versión
 * del borrador los exige `aplicarAlBorrador`.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/tienda/detalle' })) as Record<string, unknown> | null;
    const version = versionDeCuerpo(body?.version);
    if (!body || !esTipoPaginaDetalle(body.tipo) || version === 'invalido' || version === null) {
      return respuestaError('peticion_invalida', 'Se esperaba { tipo: product_detail | category_detail, version }.');
    }
    const tipo = body.tipo;
    const resultado = await aplicarAlBorrador(ctx, null, version, (documento) => crearPaginaDetalle(documento, tipo, randomUUID));
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return manejarError(error, 'POST sitio-web/tienda/detalle');
  }
});
