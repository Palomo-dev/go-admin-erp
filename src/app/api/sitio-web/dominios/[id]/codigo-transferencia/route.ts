/**
 * POST /api/sitio-web/dominios/[id]/codigo-transferencia (Figma B/07-23).
 *
 * Pide al registrador el código de autorización y lo envía por correo a quien
 * lo solicitó: el código nunca viaja al navegador. Solo dominios comprados con
 * GO Admin y con más de 60 días (regla de ICANN).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { dependenciasDominios, solicitarCodigoTransferencia } from '@/lib/services/website/dominios/dominiosSitioService';
import { idDeRuta, jsonError, respuestaDeError, SIN_CACHE } from '@/lib/services/website/dominios/respuestaDominios';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/dominios/[id]/codigo-transferencia';

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    return NextResponse.json(await solicitarCodigoTransferencia(ctx, id, await dependenciasDominios()), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});
