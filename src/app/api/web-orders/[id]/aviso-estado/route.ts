import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { enviarCorreoEstadoPedido } from '@/lib/services/orderStatusEmailService';

/**
 * POST /api/web-orders/[id]/aviso-estado
 *
 * Avisa al cliente por correo del estado ACTUAL de su pedido web. Lo llaman
 * Pedidos online (cambio de estado, confirmación, cobro) y Comandas (marcar
 * lista: el trigger trg_comanda_web_avanza_pedido ya movió el pedido).
 *
 * Sesión + membresía (`withOrg`): la organización sale de la sesión y el
 * pedido se lee filtrado por ella (un id de otra organización → 404). El
 * correo se arma con el estado guardado, nunca con uno que mande el cliente.
 * `estado` (opcional) es solo una condición: si el pedido no está en ese
 * estado no se envía nada (p. ej. Comandas marca lista pero el trigger de E5
 * aún no está aplicado y el pedido sigue «confirmado»: no se repite ese aviso).
 * Service role solo después de validar la pertenencia: el cocinero puede no
 * tener lectura de organizations.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  const body = await readOrgBody<{ estado?: unknown }>(ctx, request, { route: 'web-orders/aviso-estado' });
  const esperado = typeof body?.estado === 'string' ? body.estado : null;
  const params = (await routeParams?.params) ?? {};
  const orderId = typeof params.id === 'string' ? params.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: pedido } = await db
    .from('web_orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  if (esperado && pedido.status !== esperado) {
    return NextResponse.json({ success: true, enviado: false, motivo: 'estado_distinto' });
  }

  const enviado = await enviarCorreoEstadoPedido(db, ctx.organizationId, orderId);
  return NextResponse.json({ success: true, enviado });
});
