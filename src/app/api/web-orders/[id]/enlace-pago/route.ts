import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import { urlSeguimiento } from '@/lib/services/orderStatusEmailService';

/**
 * GET /api/web-orders/[id]/enlace-pago
 *
 * Enlace a la página del pedido en la tienda (`/pedido/<n>?t=<token>`), donde el cliente paga el
 * anticipo de una contraentrega («Enviar enlace de pago por WhatsApp», Figma 3014:194407 › 06 B).
 * Sesión + membresía (`withOrg`): el pedido se lee filtrado por la organización de la sesión (un id
 * ajeno → 404). El token es el mismo HMAC con que la tienda valida el seguimiento; el secreto vive
 * solo en el servidor. Service role solo después de validar la pertenencia.
 */
export const GET = withOrg(async (ctx, _request, routeParams) => {
  const params = (await routeParams?.params) ?? {};
  const orderId = typeof params.id === 'string' ? params.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const [{ data: pedido }, { data: org }, { data: dominios }] = await Promise.all([
    db.from('web_orders').select('id, order_number').eq('id', orderId).eq('organization_id', ctx.organizationId).maybeSingle(),
    db.from('organizations').select('subdomain').eq('id', ctx.organizationId).maybeSingle(),
    db.from('organization_domains').select('host, domain_type, status, is_primary, is_active').eq('organization_id', ctx.organizationId),
  ]);
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  const host = hostSitio((dominios ?? []) as DominioDelSitio[], (org as { subdomain?: string | null } | null)?.subdomain ?? null);
  const url = urlSeguimiento(
    { id: ctx.organizationId, host },
    { id: pedido.id as string, order_number: pedido.order_number as string },
  );
  if (!url) return NextResponse.json({ error: 'La organización no tiene sitio web publicado' }, { status: 409 });
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
});
