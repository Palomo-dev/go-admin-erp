import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { DECISIONES_REVISION, type DecisionRevision } from '@/lib/clientes/facturacionElectronica';

/**
 * POST /api/web-orders/[id]/revision-factura
 *
 * Revisión del documento de factura de un pedido web (Figma «06 Clientes» 3192-19436; decisiones del
 * dueño 2026-11-25): el comprador pidió factura con un documento distinto al de la ficha, o con uno
 * que está en otra ficha. Body: `{ decision: 'usar' | 'mantener' | 'ligar' }`.
 *
 * La decisión la aplica la base con la SESIÓN del usuario (`fn_web_order_revisar_factura`:
 * pertenencia a la organización del pedido y permiso crm.customers.edit o pos.web_order.change se
 * comprueban allí; queda en billing_data.revision y en la Actividad del cliente).
 * La organización sale de la sesión (`withOrg`); un body con otra organización responde 403.
 */
export const POST = withOrg(async (ctx, request, routeParams) => {
  const body = await readOrgBody<{ decision?: unknown }>(ctx, request, { route: 'web-orders/revision-factura' });
  const params = (await routeParams?.params) ?? {};
  const orderId = typeof params.id === 'string' ? params.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'PEDIDO_INVALIDO' }, { status: 400 });
  }
  const decision = typeof body?.decision === 'string' && (DECISIONES_REVISION as readonly string[]).includes(body.decision)
    ? (body.decision as DecisionRevision)
    : null;
  if (!decision) return NextResponse.json({ error: 'DECISION_INVALIDA' }, { status: 400 });

  // El pedido debe ser de la organización de la sesión (la RPC lo vuelve a comprobar).
  const { data: pedido } = await ctx.supabase
    .from('web_orders')
    .select('id')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: 'PEDIDO_NO_ENCONTRADO' }, { status: 404 });

  const { data, error } = await ctx.supabase.rpc('fn_web_order_revisar_factura', {
    p_order_id: orderId,
    p_decision: decision,
  });
  if (error) {
    const sinPermiso = error.code === '42501' || /SIN_PERMISO|Acceso denegado/.test(error.message ?? '');
    return NextResponse.json({ error: sinPermiso ? 'SIN_PERMISO' : 'NO_SE_PUDO' }, { status: sinPermiso ? 403 : 422 });
  }
  const r = (data ?? {}) as { estado?: string; customer_id?: string | null };
  return NextResponse.json({ estado: r.estado ?? 'no_aplica', customerId: r.customer_id ?? null });
});
