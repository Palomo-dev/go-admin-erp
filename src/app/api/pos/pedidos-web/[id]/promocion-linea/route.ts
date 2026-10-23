import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { aplicarExclusionPromocionPedido, ErrorExclusionPromocion } from '@/lib/pos/pedidosWeb/exclusionPromocionPedido';

const ESTADO: Record<ErrorExclusionPromocion['codigo'], number> = {
  sin_permiso: 403,
  pedido_ya_pagado: 409,
  pedido_cerrado: 409,
  lineas_venta_no_coinciden: 409,
  linea_no_encontrada: 404,
  lectura_fallida: 500,
};

/**
 * Quita o restaura la promoción de una línea del pedido. La organización sale
 * de la sesión. Si el pedido ya se pagó en línea, no se toca el dinero.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  const params = await routeParams!.params;
  const orderId = typeof params.id === 'string' ? params.id : '';
  if (!orderId) return NextResponse.json({ code: 'linea_no_encontrada', error: 'Pedido inválido' }, { status: 404 });
  try {
    const body = (await readOrgBody(ctx, request, { route: 'pos/pedidos-web/promocion-linea' })) as Record<string, unknown>;
    const itemId = typeof body.item_id === 'string' ? body.item_id : '';
    if (!itemId) return NextResponse.json({ code: 'linea_no_encontrada', error: 'Falta la línea' }, { status: 400 });
    const resultado = await aplicarExclusionPromocionPedido(
      ctx,
      orderId,
      itemId,
      body.excluded === true,
      typeof body.reason === 'string' ? body.reason : null,
    );
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof ErrorExclusionPromocion) {
      return NextResponse.json({ code: error.codigo, error: error.message }, { status: ESTADO[error.codigo] });
    }
    throw error;
  }
});
