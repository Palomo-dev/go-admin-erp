/**
 * /api/sitio-web/tienda/resenas — moderación de reseñas de Sitio web › Tienda.
 *
 * GET ?estado=pending|approved|rejected|all&pagina=N → reseñas de la
 *     organización de la sesión, paginadas.
 * PATCH { id, accion: 'aprobar' | 'rechazar' | 'responder', respuesta? }
 *
 * Organización de la sesión (`withOrg` + `readOrgBody`) y permiso
 * `website.sites.edit` (`permisosSitio`) en lectura y escritura: quien en
 * Tienda ve el interruptor de autoaprobar deshabilitado tampoco modera. La
 * consulta y la escritura son las de `resenasProducto.ts`, las mismas que usa
 * `/api/product-reviews`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { esEstadoResena } from '@/lib/services/website/resenasProducto';
import { ErrorTienda, leerResenasTienda, moderarResenaTienda, respuestaErrorTienda, type AccionResena } from '@/lib/website/tiendaSitio.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'sitio-web/tienda/resenas';
const ACCIONES: readonly AccionResena[] = ['aprobar', 'rechazar', 'responder'];
const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const p = new URL(request.url).searchParams;
    const crudo = p.get('estado') ?? 'pending';
    const estado = crudo === 'all' ? 'all' : esEstadoResena(crudo) ? crudo : null;
    if (!estado) throw new ErrorTienda('peticion_invalida', 400, 'Estado de reseña no válido.');
    const pagina = Number(p.get('pagina') ?? '1');
    return NextResponse.json(await leerResenasTienda(ctx, { estado, pagina: Number.isFinite(pagina) ? pagina : 1 }), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorTienda(error, RUTA, ctx.organizationId);
  }
});

export const PATCH = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: RUTA })) as { id?: unknown; accion?: unknown; respuesta?: unknown } | null;
    if (!body || typeof body.id !== 'string' || !PATRON_UUID.test(body.id)) throw new ErrorTienda('peticion_invalida', 400, 'Falta la reseña.');
    if (!ACCIONES.includes(body.accion as AccionResena)) throw new ErrorTienda('peticion_invalida', 400, 'Acción no válida.');
    if (body.respuesta !== undefined && body.respuesta !== null && typeof body.respuesta !== 'string') {
      throw new ErrorTienda('peticion_invalida', 400, 'La respuesta debe ser texto.');
    }
    await moderarResenaTienda(ctx, body.id, body.accion as AccionResena, body.respuesta as string | null | undefined);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorTienda(error, RUTA, ctx.organizationId);
  }
});
