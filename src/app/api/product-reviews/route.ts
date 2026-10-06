import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import {
  actualizarResenaProducto,
  esEstadoResena,
  listarResenasProducto,
  type CambioResena,
} from '@/lib/services/website/resenasProducto';

/**
 * Moderación de reseñas de producto en el ERP.
 *
 * Sesión + membresía activa (`withOrg`). La organización sale de la sesión:
 * un `organizationId` distinto en la query o el body → 403. Las consultas van
 * con service role (como antes) pero SIEMPRE acotadas a `ctx.organizationId`.
 * Moderar (PATCH) exige además `website.sites.edit`, como Sitio web › Tienda.
 * Consulta y escritura en `resenasProducto.ts` (una sola implementación).
 */

/**
 * GET /api/product-reviews?organizationId=X&status=pending&productId=Y
 *
 * Lista las reseñas de producto para moderación en el ERP.
 * Filtros opcionales: status (pending|approved|rejected), productId.
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'product-reviews' });
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const productId = searchParams.get('productId');

    // La MISMA consulta que Sitio web › Tienda › Reseñas (resenasProducto.ts).
    let resenas;
    try {
      ({ resenas } = await listarResenasProducto(getSupabaseAdmin(), ctx.organizationId, {
        estado: status && (status === 'all' || esEstadoResena(status)) ? status : null,
        productoId: productId && productId !== 'all' ? Number(productId) : null,
      }));
    } catch (error) {
      console.error('Error fetching reviews:', error);
      return NextResponse.json({ error: 'Error al obtener reseñas' }, { status: 500 });
    }

    return NextResponse.json({ reviews: resenas });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) throw error;
    console.error('GET /api/product-reviews:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
});

/**
 * PATCH /api/product-reviews
 *
 * Actualiza el estado de una reseña (aprobar, rechazar, responder) de la
 * organización de la sesión. Body: { reviewId, status?, rejectionReason?, replyText? }
 * Una reseña de otra organización → 404.
 */
export const PATCH = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'product-reviews' });
    const { reviewId, status, rejectionReason, replyText } = body ?? {};

    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId requerido' }, { status: 400 });
    }

    // Moderar es editar el sitio: el mismo permiso que Sitio web › Tienda.
    const permisos = await permisosSitio(ctx);
    if (!permisos.editar) {
      return NextResponse.json({ error: 'No tienes permiso para moderar reseñas' }, { status: 403 });
    }

    const cambio: CambioResena = {};
    if (esEstadoResena(status)) cambio.estado = status;
    if (rejectionReason !== undefined) cambio.motivoRechazo = rejectionReason;
    if (replyText !== undefined) cambio.respuesta = replyText;
    if (Object.keys(cambio).length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    let data;
    try {
      data = await actualizarResenaProducto(getSupabaseAdmin(), ctx.organizationId, String(reviewId), cambio, ctx.userId);
    } catch (error) {
      console.error('Error updating review:', error);
      return NextResponse.json({ error: 'Error al actualizar reseña' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Reseña no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, review: data });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) throw error;
    console.error('PATCH /api/product-reviews:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
});
