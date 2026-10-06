/**
 * /api/sitio-web/dominios/[id] (Figma B/07-09, 07-21, 07-22, 07-24).
 *
 * - GET: detalle (registros, SSL, redirecciones, renovación, transferencia).
 * - PATCH {principal: true} | {autoRenovar: boolean}.
 * - DELETE: quita el dominio y su www (el subdominio del sistema, 422).
 *
 * El id se busca DENTRO de la organización de la sesión: el de otra es 404.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import {
  cambiarAutoRenovar,
  dependenciasDominios,
  hacerPrincipal,
  leerDetalle,
  quitarDominio,
} from '@/lib/services/website/dominios/dominiosSitioService';
import { idDeRuta, jsonError, respuestaDeError, SIN_CACHE } from '@/lib/services/website/dominios/respuestaDominios';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/dominios/[id]';

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    return NextResponse.json(await leerDetalle(ctx, id, await dependenciasDominios()), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});

export const PATCH = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = await readOrgBody<{ principal?: unknown; autoRenovar?: unknown }>(ctx, request, { route: RUTA });
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    const deps = await dependenciasDominios();
    if (body.principal === true) return NextResponse.json({ dominio: await hacerPrincipal(ctx, id, deps) }, { headers: SIN_CACHE });
    if (typeof body.autoRenovar === 'boolean') {
      return NextResponse.json({ dominio: await cambiarAutoRenovar(ctx, id, body.autoRenovar, deps) }, { headers: SIN_CACHE });
    }
    return jsonError(400, 'error_interno', 'Indica { principal: true } o { autoRenovar: true|false }.');
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    await quitarDominio(ctx, id, await dependenciasDominios());
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (error) {
    return respuestaDeError(RUTA, ctx.organizationId, error);
  }
});
