/**
 * Quitar o restaurar la promoción de una línea de pedido web, antes de
 * confirmar o de cobrar. El motor es el mismo del POS (`promotionEngine`).
 * El cupón que no es promoción se queda en las otras líneas.
 *
 * `web_orders` no tiene saldo: lo que se cobra es `total`. Si el pedido ya
 * tiene venta y sigue abierta, la venta y sus líneas se actualizan con el
 * mismo reparto para que el cobro no use el descuento viejo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { promotionEngine } from '@/lib/services/promotionEngine';
import { lineasVentaPedidoWeb, planExclusionPromocionPedido } from '@/lib/services/webOrderTotals';
import type { WebOrder, WebOrderItem } from '@/lib/services/webOrdersService';

const CERRADOS = new Set(['cancelled', 'rejected', 'expired', 'delivered', 'refunded']);

export class ErrorExclusionPromocion extends Error {
  constructor(
    readonly codigo: 'pedido_ya_pagado' | 'sin_permiso' | 'linea_no_encontrada' | 'pedido_cerrado' | 'lineas_venta_no_coinciden' | 'lectura_fallida',
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export interface ResultadoExclusionPedido {
  discount_total: number;
  tax_total: number;
  total: number;
  promo_excluded: boolean;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function redondear(v: number): number {
  return Math.round(v * 100) / 100;
}

interface Ctx {
  organizationId: number;
  userId: string;
  roleId: number;
  isSuperAdmin: boolean;
  supabase: SupabaseClient;
}

interface VentaAbierta {
  id: string;
  status: string;
  payment_status: string | null;
  total: number;
  balance: number;
}

export async function aplicarExclusionPromocionPedido(
  ctx: Ctx,
  orderId: string,
  itemId: string,
  excluded: boolean,
  reason: string | null,
): Promise<ResultadoExclusionPedido> {
  const permitido = await hasOrgAdminOrPermission(ctx, 'pos.promotions.remove');
  if (!permitido) throw new ErrorExclusionPromocion('sin_permiso', 'No tienes permiso para quitar la promoción');

  const { data: pedido, error: ePedido } = await ctx.supabase
    .from('web_orders')
    .select('id, organization_id, branch_id, status, payment_status, subtotal, tax_total, discount_total, delivery_fee, tip_amount, total, sale_id, order_number')
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (ePedido) throw new ErrorExclusionPromocion('lectura_fallida', ePedido.message);
  if (!pedido) throw new ErrorExclusionPromocion('linea_no_encontrada', 'El pedido no existe');
  if (pedido.payment_status === 'paid') {
    throw new ErrorExclusionPromocion('pedido_ya_pagado', 'El pedido ya se pagó en línea');
  }
  if (CERRADOS.has(String(pedido.status))) {
    throw new ErrorExclusionPromocion('pedido_cerrado', 'El pedido ya no se puede modificar');
  }

  const { data: filas, error: eFilas } = await ctx.supabase
    .from('web_order_items')
    .select('id, product_id, product_name, quantity, unit_price, tax_amount, discount_amount, total, promo_excluded, status, created_at')
    .eq('web_order_id', orderId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (eFilas) throw new ErrorExclusionPromocion('lectura_fallida', eFilas.message);
  const items = (filas ?? []) as WebOrderItem[];
  const idx = items.findIndex((it) => it.id === itemId);
  if (idx < 0) throw new ErrorExclusionPromocion('linea_no_encontrada', 'La línea no está en el pedido');

  const evaluar = (flags: boolean[]) =>
    promotionEngine.evaluate({
      channel: 'web',
      organization_id: ctx.organizationId,
      branch_id: pedido.branch_id ?? undefined,
      db: ctx.supabase,
      items: items.map((it, i) => ({
        product_id: Number(it.product_id),
        quantity: n(it.quantity),
        unit_price: n(it.unit_price),
        promo_excluded: flags[i],
      })),
    });

  const flagsAntes = items.map((it) => it.promo_excluded === true);
  const flagsAhora = flagsAntes.map((f, i) => (i === idx ? excluded : f));
  const [antes, ahora] = await Promise.all([evaluar(flagsAntes), evaluar(flagsAhora)]);
  const plan = planExclusionPromocionPedido({
    subtotal: n(pedido.subtotal),
    tax_total: n(pedido.tax_total),
    discount_total: n(pedido.discount_total),
    delivery_fee: n(pedido.delivery_fee),
    tip_amount: n(pedido.tip_amount),
    total: n(pedido.total),
    brutos: items.map((it) => redondear(n(it.quantity) * n(it.unit_price))),
    impuestosLinea: items.map((it) => n(it.tax_amount)),
    promoAntes: antes.discountTotal,
    promoAhoraPorLinea: ahora.lineDiscounts,
    excluidas: flagsAhora,
    descuentosPrevios: items.map((it) => n(it.discount_amount)),
  });

  let sale: VentaAbierta | null = null;
  let lineasVenta: Array<{ id: string }> = [];
  if (pedido.sale_id) {
    const { data: venta, error: eVenta } = await ctx.supabase
      .from('sales')
      .select('id, status, payment_status, total, balance')
      .eq('id', pedido.sale_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (eVenta) throw new ErrorExclusionPromocion('lectura_fallida', eVenta.message);
    if (venta) {
      if (venta.payment_status === 'paid' || venta.status === 'paid') {
        throw new ErrorExclusionPromocion('pedido_ya_pagado', 'La venta del pedido ya está pagada');
      }
      if (!['pending', 'draft', 'partial'].includes(String(venta.status))) {
        throw new ErrorExclusionPromocion('pedido_cerrado', 'La venta del pedido ya está cerrada');
      }
      const { data: si, error: eSi } = await ctx.supabase
        .from('sale_items')
        .select('id, product_id, quantity')
        .eq('sale_id', venta.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (eSi) throw new ErrorExclusionPromocion('lectura_fallida', eSi.message);
      lineasVenta = ((si ?? []) as Array<{ id: string; product_id: number | null; quantity: number }>).filter(
        (l) => l.product_id != null && n(l.quantity) > 0,
      );
      if (lineasVenta.length !== items.length) {
        throw new ErrorExclusionPromocion(
          'lineas_venta_no_coinciden',
          'La venta ya no tiene las mismas líneas que el pedido. No se cambió el cobro.',
        );
      }
      sale = venta as VentaAbierta;
    }
  }

  const motivo = reason?.trim() ? reason.trim().slice(0, 240) : null;
  const cuando = new Date().toISOString();
  const tocadas = (excluded ? antes : ahora).applied.filter((a) => a.lineas.includes(idx));
  const monto = Math.abs(redondear((antes.lineDiscounts[idx] ?? 0) - (ahora.lineDiscounts[idx] ?? 0)));

  for (let i = 0; i < items.length; i++) {
    const cambioLinea = plan.descuentos[i] !== n(items[i].discount_amount) || plan.impuestos[i] !== n(items[i].tax_amount) || flagsAhora[i] !== flagsAntes[i];
    if (!cambioLinea && i !== idx) continue;
    const { error } = await ctx.supabase
      .from('web_order_items')
      .update({
        discount_amount: plan.descuentos[i],
        tax_amount: plan.impuestos[i],
        promo_excluded: flagsAhora[i],
        ...(i === idx
          ? {
              promo_excluded_reason: flagsAhora[i] ? motivo : null,
              promo_excluded_by: flagsAhora[i] ? ctx.userId : null,
              promo_excluded_at: flagsAhora[i] ? cuando : null,
            }
          : {}),
      })
      .eq('id', items[i].id)
      .eq('web_order_id', orderId);
    if (error) throw new ErrorExclusionPromocion('lectura_fallida', error.message);
  }

  const { error: eOrden } = await ctx.supabase
    .from('web_orders')
    .update({
      discount_total: plan.discount_total,
      tax_total: plan.tax_total,
      total: plan.total,
    })
    .eq('id', orderId)
    .eq('organization_id', ctx.organizationId);
  if (eOrden) throw new ErrorExclusionPromocion('lectura_fallida', eOrden.message);

  if (sale) {
    const orderPlan = {
      ...(pedido as unknown as WebOrder),
      discount_total: plan.discount_total,
      tax_total: plan.tax_total,
      total: plan.total,
      items: items.map((it, i) => ({
        ...it,
        discount_amount: plan.descuentos[i],
        tax_amount: plan.impuestos[i],
        promo_excluded: flagsAhora[i],
        promo_excluded_reason: i === idx ? (flagsAhora[i] ? motivo : null) : it.promo_excluded_reason ?? null,
        promo_excluded_by: i === idx ? (flagsAhora[i] ? ctx.userId : null) : it.promo_excluded_by ?? null,
        promo_excluded_at: i === idx ? (flagsAhora[i] ? cuando : null) : it.promo_excluded_at ?? null,
      })),
    } as WebOrder;
    const lineasNuevas = lineasVentaPedidoWeb(orderPlan);
    for (let i = 0; i < lineasVenta.length; i++) {
      const linea = lineasNuevas[i];
      const { error } = await ctx.supabase
        .from('sale_items')
        .update({
          discount_amount: linea?.discount_amount ?? plan.descuentos[i],
          tax_amount: linea?.tax_amount ?? plan.impuestos[i],
          total: linea?.total ?? redondear(n(items[i].quantity) * n(items[i].unit_price) - plan.descuentos[i]),
          promo_excluded: flagsAhora[i],
          ...(i === idx
            ? {
                promo_excluded_reason: flagsAhora[i] ? motivo : null,
                promo_excluded_by: flagsAhora[i] ? ctx.userId : null,
                promo_excluded_at: flagsAhora[i] ? cuando : null,
              }
            : {}),
        })
        .eq('id', lineasVenta[i].id)
        .eq('sale_id', sale.id);
      if (error) throw new ErrorExclusionPromocion('lectura_fallida', error.message);
    }
    const pagado = Math.max(0, redondear(n(sale.total) - n(sale.balance)));
    const { error: eSale } = await ctx.supabase
      .from('sales')
      .update({
        discount_total: plan.discount_total,
        tax_total: plan.tax_total,
        total: plan.total,
        balance: Math.max(0, redondear(plan.total - pagado)),
      })
      .eq('id', sale.id)
      .eq('organization_id', ctx.organizationId);
    if (eSale) throw new ErrorExclusionPromocion('lectura_fallida', eSale.message);
  }

  const { error: eAudit } = await ctx.supabase.from('ops_audit_log').insert({
    organization_id: ctx.organizationId,
    branch_id: pedido.branch_id ?? null,
    user_id: ctx.userId,
    entity_type: sale ? 'sale' : 'web_order',
    entity_id: sale ? sale.id : orderId,
    action: excluded ? 'promo_excluded' : 'promo_restored',
    metadata: {
      web_order_id: orderId,
      web_order_item_id: itemId,
      sale_item_id: sale ? lineasVenta[idx]?.id ?? null : null,
      product_id: items[idx].product_id,
      promotion_id: tocadas[0]?.promotion_id ?? null,
      promotion_name: tocadas.map((a) => a.promotion_name).filter(Boolean).join(', ') || null,
      amount: monto,
      reason: motivo,
    },
  });
  if (eAudit) throw new ErrorExclusionPromocion('lectura_fallida', eAudit.message);

  return {
    discount_total: plan.discount_total,
    tax_total: plan.tax_total,
    total: plan.total,
    promo_excluded: excluded,
  };
}
