import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Redención del cupón de un pedido web, una sola regla para los dos caminos de confirmación:
 * el botón «Confirmar pedido» (webOrderConfirmationService, cliente del navegador) y la
 * confirmación por pasarela (webOrderServerConfirmation, service role).
 *
 * `coupon_redemptions.sale_id` es FK a `sales(id)`: la redención solo puede existir cuando la
 * venta ya existe, así que se registra al confirmar y no al crear el pedido. El sitio intentaba
 * insertarla con el uuid del pedido web y la FK la rechazaba (23503) en todos los pedidos.
 *
 * Idempotente por venta: un reintento de la confirmación devuelve la redención ya creada. El
 * trigger `trg_coupon_redemption_increment` suma 1 a `coupons.usage_count` al insertar; aquí no
 * se incrementa a mano. Nunca lanza: un error no debe dejar la confirmación a medias.
 */
export interface PedidoConCupon {
  id: string;
  organization_id: number;
  coupon_code?: string | null;
  customer_id?: string | null;
  discount_total?: number | null;
}

export async function redimirCuponPedidoWeb(
  supabase: SupabaseClient,
  order: PedidoConCupon,
  saleId: string,
): Promise<string> {
  if (!order.coupon_code || !saleId) return '';
  try {
    // Reintento de la confirmación: la redención ya apunta a la venta.
    const { data: yaVinculada } = await supabase
      .from('coupon_redemptions')
      .select('id')
      .eq('sale_id', saleId)
      .limit(1)
      .maybeSingle();
    if (yaVinculada) return (yaVinculada as { id: string }).id;

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('id')
      .eq('organization_id', order.organization_id)
      .eq('code', order.coupon_code)
      .eq('is_active', true)
      .maybeSingle();
    if (couponError || !coupon) {
      console.warn(`[cuponPedidoWeb] Cupón "${order.coupon_code}" no encontrado o inactivo (pedido ${order.id})`);
      return '';
    }

    const { data: redemption, error: redemptionError } = await supabase
      .from('coupon_redemptions')
      .insert({
        coupon_id: (coupon as { id: string }).id,
        sale_id: saleId,
        customer_id: order.customer_id || null,
        discount_applied: order.discount_total || 0,
      })
      .select('id')
      .single();
    if (redemptionError) {
      console.error('[cuponPedidoWeb] Error creando coupon_redemption:', redemptionError);
      return '';
    }
    return (redemption as { id: string } | null)?.id || '';
  } catch (error) {
    console.error('[cuponPedidoWeb] Error redimiendo cupón:', error);
    return '';
  }
}
