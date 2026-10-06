import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { listarAvisosPedido } from '@/lib/services/avisosClienteService';

/**
 * GET /api/web-orders/[id]/avisos — «Avisos en el historial del pedido»
 * (Figma 465:85608): cada aviso con canal, hora y estado. Lectura con la
 * sesión del usuario (RLS por pertenencia) y filtrada por la organización de
 * la sesión.
 */
export const GET = withOrg(async (ctx, _request, routeParams) => {
  const params = (await routeParams?.params) ?? {};
  const orderId = typeof params.id === 'string' ? params.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const r = await listarAvisosPedido(ctx.supabase, ctx.organizationId, orderId);
  return NextResponse.json(r, { headers: { 'Cache-Control': 'private, no-store' } });
});
