/**
 * GET y POST /api/sitio-web/dominios/[id]/correo
 *
 * Estado del correo de pedidos de ese dominio, y el botón Verificar.
 * La organización sale de la sesión. No devuelve secretos ni la clave del proveedor.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { ErrorDominios, permisosDominios } from '@/lib/services/website/dominios/dominiosSitioService';
import { ErrorCorreoTienda, leerEstadoCorreoTienda, verificarCorreoTienda } from '@/lib/services/website/dominios/correoTienda';
import { idDeRuta, jsonError, respuestaDeError, SIN_CACHE } from '@/lib/services/website/dominios/respuestaDominios';

export const dynamic = 'force-dynamic';

const RUTA = 'sitio-web/dominios/[id]/correo';

async function exigir(ctx: Parameters<typeof permisosDominios>[0]): Promise<void> {
  const permisos = await permisosDominios(ctx);
  if (!permisos.gestionar) throw new ErrorDominios(403, 'sin_permiso', 'No tienes permiso para gestionar dominios.');
}

function traducir(error: unknown): NextResponse | null {
  if (error instanceof ErrorCorreoTienda) {
    const codigo = error.estadoHttp === 404 ? 'no_existe' : 'error_interno';
    return jsonError(error.estadoHttp === 404 ? 404 : 500, codigo, error.message);
  }
  return null;
}

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigir(ctx);
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    return NextResponse.json(await leerEstadoCorreoTienda(ctx.organizationId, id), { headers: SIN_CACHE });
  } catch (error) {
    return traducir(error) ?? respuestaDeError(RUTA, ctx.organizationId, error);
  }
});

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigir(ctx);
    const id = await idDeRuta(routeParams);
    if (!id) return jsonError(404, 'no_existe', 'No encontramos ese dominio.');
    return NextResponse.json(await verificarCorreoTienda(ctx.organizationId, id), { headers: SIN_CACHE });
  } catch (error) {
    return traducir(error) ?? respuestaDeError(RUTA, ctx.organizationId, error);
  }
});
