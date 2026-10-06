import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { aplicarAlBorrador } from '@/lib/services/website/paginasSitioService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { restaurarPaginasBase } from '@/components/sitio-web/paginas/operacionesPagina';
import { sitioDeCuerpo, versionDeCuerpo } from '@/components/sitio-web/paginas/parametrosPaginas';

/**
 * POST { sitio, version } → «Restaurar páginas base» (Figma A/04e): añade al borrador las páginas
 * base del giro de la organización que falten (comparando por dirección). El giro lo resuelve el
 * servidor desde `organizations.type_id`, nunca el cliente.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'sitio-web/paginas/base' })) as Record<string, unknown>;
    const sitio = sitioDeCuerpo(body.sitio);
    const version = versionDeCuerpo(body.version);
    if (sitio === 'invalido' || version === 'invalido') return respuestaError('peticion_invalida', 'Se esperaba { sitio, version }.');
    return NextResponse.json(await aplicarAlBorrador(ctx, sitio, version, (d, giro) => restaurarPaginasBase(d, giro, randomUUID)));
  } catch (error) {
    return manejarError(error, 'POST sitio-web/paginas/base');
  }
});
