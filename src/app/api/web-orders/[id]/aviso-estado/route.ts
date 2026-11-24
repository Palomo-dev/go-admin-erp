import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { enviarAvisoNovedadPedido, enviarCorreoEstadoPedido } from '@/lib/services/orderStatusEmailService';

/**
 * POST /api/web-orders/[id]/aviso-estado
 *
 * Avisa al cliente por correo del estado ACTUAL de su pedido web. Lo llaman
 * Pedidos online (cambio de estado, confirmación, cobro) y Comandas (marcar
 * lista: el trigger trg_comanda_web_avanza_pedido ya movió el pedido).
 *
 * `canal` (opcional, «Reenviar» del historial): repite solo ese canal. Qué
 * canales salen lo deciden los ajustes de Avisos al cliente.
 *
 * Sin `canal` es un aviso automático (cambio de estado en Pedidos online, en
 * Logística o en Comandas) y sale UNA vez por momento y canal: desde que el
 * envío y el pedido comparten estado (migración 20261124233000), «listo»,
 * «en camino» y «entregado» pueden pedirse por los dos lados y el cliente no
 * debe recibirlos dos veces. «Reenviar» sí repite.
 *
 * Sesión + membresía (`withOrg`): la organización sale de la sesión y el
 * pedido se lee filtrado por ella (un id de otra organización → 404). El
 * correo se arma con el estado guardado, nunca con uno que mande el cliente.
 * `estado` (opcional) es solo una condición: si el pedido no está en ese
 * estado no se envía nada (p. ej. Comandas marca lista pero el trigger de E5
 * aún no está aplicado y el pedido sigue «confirmado»: no se repite ese aviso).
 * Service role solo después de validar la pertenencia: el cocinero puede no
 * tener lectura de organizations.
 *
 * `momento: 'novedad'` (logística Fase 1): avisa que el domiciliario no pudo
 * entregar, con el motivo guardado en el envío (`shipments.exception_reason`),
 * nunca uno del body, y solo si el envío está en `failed_attempt`. Lo llaman
 * quien registró la novedad (detalle del envío y app del domiciliario) y
 * «Avisar» de Seguimiento.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  const body = await readOrgBody<{ estado?: unknown; canal?: unknown; momento?: unknown }>(ctx, request, { route: 'web-orders/aviso-estado' });
  const esperado = typeof body?.estado === 'string' ? body.estado : null;
  // «Reenviar» del historial del pedido: solo el canal de esa línea.
  const canal = body?.canal === 'email' || body?.canal === 'whatsapp' ? body.canal : null;
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
  if (body?.momento === 'novedad') {
    // Solo si el envío del pedido está de verdad en novedad (intento fallido): la ruta no avisa
    // novedades inventadas ni repite un aviso cuando el envío ya siguió su curso.
    const { data: envio } = await db
      .from('shipments')
      .select('status')
      .eq('organization_id', ctx.organizationId)
      .eq('source_type', 'web_order')
      .eq('source_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (envio?.status !== 'failed_attempt') {
      return NextResponse.json({ success: true, enviado: false, motivo: 'sin_novedad' });
    }
    const enviado = await enviarAvisoNovedadPedido(db, ctx.organizationId, orderId, { actor: ctx.userId });
    return NextResponse.json({ success: true, enviado });
  }
  if (esperado && pedido.status !== esperado) {
    return NextResponse.json({ success: true, enviado: false, motivo: 'estado_distinto' });
  }

  const enviado = await enviarCorreoEstadoPedido(db, ctx.organizationId, orderId, { actor: ctx.userId, soloCanal: canal, unaVez: !canal });
  return NextResponse.json({ success: true, enviado });
});
