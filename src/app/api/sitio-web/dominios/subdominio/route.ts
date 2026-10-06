/**
 * PUT /api/sitio-web/dominios/subdominio {subdominio} (Figma B/07-03).
 *
 * Valida la forma y la unicidad en el servidor y actualiza
 * `organizations.subdomain` y la fila `system_subdomain` con service role.
 * Antes lo hacía `SubdomainManager` desde el navegador.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cambiarSubdominio, dependenciasDominios } from '@/lib/services/website/dominios/dominiosSitioService';
import { respuestaDeError, SIN_CACHE } from '@/lib/services/website/dominios/respuestaDominios';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/dominios/subdominio';

export const PUT = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ subdominio?: unknown }>(ctx, request, { route: RUTA });
    return NextResponse.json(await cambiarSubdominio(ctx, body.subdominio, await dependenciasDominios()), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});
