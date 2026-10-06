/**
 * /api/sitio-web/dominios (Figma B/07-01…07-06).
 *
 * - GET [?sede=<id>]: lista de dominios, subdominio, dirección pública,
 *   avisos, permisos y, si se pide, la sede preseleccionada (validada contra
 *   la organización de la sesión).
 * - POST {host, sedeId?}: conecta un dominio propio (raíz + www) y devuelve
 *   los registros DNS que hay que crear.
 *
 * Organización de la sesión (`withOrg`); una organización distinta en la
 * query o el body → 403 y registro (`readOrgBody`). Permiso `website.domains`
 * resuelto en el servidor (`dominiosSitioService`).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { conectarDominio, dependenciasDominios, leerDominios } from '@/lib/services/website/dominios/dominiosSitioService';
import { respuestaDeError, SIN_CACHE } from '@/lib/services/website/dominios/respuestaDominios';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/dominios';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const deps = await dependenciasDominios();
    const sede = new URL(request.url).searchParams.get('sede');
    return NextResponse.json(await leerDominios(ctx, deps, { sede }), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ host?: unknown; sedeId?: unknown }>(ctx, request, { route: RUTA });
    const deps = await dependenciasDominios();
    return NextResponse.json(await conectarDominio(ctx, { host: body.host, sedeId: body.sedeId }, deps), { status: 201, headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});
