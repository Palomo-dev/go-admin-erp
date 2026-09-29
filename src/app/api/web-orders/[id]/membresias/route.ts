/**
 * POST /api/web-orders/[id]/membresias — activa las membresías de un pedido web confirmado A MANO
 * desde «Pedidos online» (docs/design/MEMBRESIAS-FASE-1-2.md §4, «Tienda web»).
 *
 * La confirmación manual corre en el navegador (webOrderConfirmationService) y la activación NO
 * puede hacerse desde allí: `fn_membresias_activar_venta` solo está concedida a service_role. Esta
 * ruta valida la sesión y que el pedido y su venta sean de la organización de la sesión, y después
 * llama la RPC con el service role. Es idempotente (la base deduplica por línea de venta).
 * Pedido de otra organización o sin venta → 404. Organización ajena en el body → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { esErrorMembresiaSinCliente, leerMembresiasVendidas } from '@/lib/pos/venta/membresias';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'POST /api/web-orders/[id]/membresias' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'pedido_no_encontrado', codigo: 'pedido_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  // Lectura con la sesión (RLS) y filtrada por la organización de la sesión.
  const { data: pedido } = await ctx.supabase
    .from('web_orders')
    .select('id, payment_status, organization_id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!pedido) {
    return NextResponse.json({ error: 'pedido_no_encontrado', codigo: 'pedido_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  // La venta del pedido (una sola viva por pedido: uq_sales_web_order_viva), de la misma organización.
  const servicio = getServiceClient();
  const { data: venta } = await servicio
    .from('sales')
    .select('id')
    .eq('web_order_id', id)
    .eq('organization_id', ctx.organizationId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle();
  if (!venta) {
    return NextResponse.json({ error: 'pedido_no_encontrado', codigo: 'pedido_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  const { data, error } = await servicio.rpc('fn_membresias_activar_venta', {
    p_sale_id: venta.id,
    p_invoice_id: null,
    p_source: 'web',
    p_pagado: pedido.payment_status === 'paid' ? true : null,
  });
  if (error) {
    const codigo = esErrorMembresiaSinCliente(error) ? 'membresia_sin_cliente' : 'error_interno';
    if (codigo === 'error_interno') console.error('[web-orders/membresias] activación falló', { pedido: id, mensaje: error.message });
    return NextResponse.json({ error: codigo, codigo }, { status: codigo === 'membresia_sin_cliente' ? 422 : 500, headers: SIN_CACHE });
  }
  return NextResponse.json({ membresias: leerMembresiasVendidas(data) }, { headers: SIN_CACHE });
});
