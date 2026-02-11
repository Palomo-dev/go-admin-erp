import { supabase } from '@/lib/supabase/config';
import { getCurrentUserId } from '@/lib/hooks/useOrganization';
import { PropinasService } from '@/components/pos/propinas/propinasService';
import { deliveryIntegrationService } from './deliveryIntegrationService';
import type { WebOrder } from './webOrdersService';

export interface ConfirmOrderResult {
  saleId: string;
  kitchenTicketId: number;
  tipId?: string;
  shipmentId?: string;
  couponRedemptionId?: string;
}

/**
 * Servicio de confirmación de pedidos online.
 * Al confirmar un pedido web, crea automáticamente:
 * 1. sale + sale_items (venta POS)
 * 2. kitchen_ticket + kitchen_ticket_items (comanda cocina)
 * 3. tips (si tip_amount > 0)
 * 4. coupon_redemption (si coupon_code existe)
 * 5. Vincula web_orders.sale_id con la venta creada
 */
class WebOrderConfirmationService {

  /**
   * Confirmar un pedido online completo:
   * - Crea sale + sale_items
   * - Genera kitchen_ticket + kitchen_ticket_items
   * - Registra tip si aplica
   * - Redime cupón si aplica
   * - Actualiza web_orders con sale_id, status, timestamps
   */
  async confirmOrder(
    order: WebOrder,
    estimatedMinutes: number = 30
  ): Promise<ConfirmOrderResult> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No se pudo obtener el usuario actual');

    const now = new Date().toISOString();
    const estimatedReadyAt = new Date(Date.now() + estimatedMinutes * 60000).toISOString();

    // 1. Crear sale (venta POS)
    const saleId = await this.createSale(order, userId);

    // 2. Crear sale_items y obtener los IDs insertados
    const insertedSaleItems = await this.createSaleItems(order, saleId);

    // 3. Crear kitchen_ticket + kitchen_ticket_items
    const kitchenTicketId = await this.createKitchenTicket(
      order,
      saleId,
      insertedSaleItems,
      estimatedMinutes
    );

    // 4. Crear tip si tip_amount > 0
    let tipId: string | undefined;
    if (order.tip_amount && order.tip_amount > 0) {
      tipId = await this.createTip(order, saleId, userId);
    }

    // 5. Redimir cupón si coupon_code existe
    let couponRedemptionId: string | undefined;
    if (order.coupon_code) {
      couponRedemptionId = await this.redeemCoupon(order, saleId);
    }

    // 6. Crear shipment automático si es delivery propio
    let shipmentId: string | undefined;
    if (order.delivery_type === 'delivery_own') {
      shipmentId = await this.createShipment(order);
    }

    // 7. Calcular estimated_delivery_at para pedidos delivery
    const estimatedDeliveryAt = order.delivery_type !== 'pickup'
      ? new Date(Date.now() + (estimatedMinutes + 30) * 60000).toISOString()
      : undefined;

    // 8. Actualizar web_orders: sale_id + status + timestamps
    const { error: updateError } = await supabase
      .from('web_orders')
      .update({
        sale_id: saleId,
        status: 'confirmed',
        confirmed_at: now,
        confirmed_by: userId,
        estimated_ready_at: estimatedReadyAt,
        ...(estimatedDeliveryAt ? { estimated_delivery_at: estimatedDeliveryAt } : {}),
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Error actualizando web_order:', updateError);
      throw new Error(`Error vinculando pedido con venta: ${updateError.message}`);
    }

    return { saleId, kitchenTicketId, tipId, shipmentId, couponRedemptionId };
  }

  /**
   * Crear venta POS a partir de un web_order
   */
  private async createSale(order: WebOrder, userId: string): Promise<string> {
    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        customer_id: order.customer_id || null,
        user_id: userId,
        total: order.total,
        subtotal: order.subtotal,
        tax_total: order.tax_total,
        discount_total: order.discount_total,
        balance: order.payment_status === 'paid' ? 0 : order.total,
        status: order.payment_status === 'paid' ? 'paid' : 'pending',
        payment_status: order.payment_status || 'pending',
        notes: `Pedido web: ${order.order_number}`,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creando sale:', error);
      throw new Error(`Error al crear venta: ${error.message}`);
    }

    return sale.id;
  }

  /**
   * Crear sale_items a partir de web_order_items
   */
  private async createSaleItems(
    order: WebOrder,
    saleId: string
  ): Promise<{ id: string; product_id: number | null }[]> {
    if (!order.items || order.items.length === 0) {
      return [];
    }

    const saleItems = order.items.map(item => ({
      sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
      tax_amount: item.tax_amount || 0,
      discount_amount: item.discount_amount || 0,
      notes: {
        product_name: item.product_name,
        from_web_order: order.order_number,
        ...(item.modifiers && item.modifiers.length > 0 ? { modifiers: item.modifiers } : {}),
        ...(item.notes ? { customer_notes: item.notes } : {}),
      },
    }));

    const { data: insertedItems, error } = await supabase
      .from('sale_items')
      .insert(saleItems)
      .select('id, product_id');

    if (error) {
      console.error('Error creando sale_items:', error);
      throw new Error(`Error al crear ítems de venta: ${error.message}`);
    }

    return insertedItems || [];
  }

  /**
   * Crear kitchen_ticket + kitchen_ticket_items para enviar a cocina
   */
  private async createKitchenTicket(
    order: WebOrder,
    saleId: string,
    saleItems: { id: string; product_id: number | null }[],
    estimatedMinutes: number
  ): Promise<number> {
    if (saleItems.length === 0) {
      throw new Error('No hay ítems para crear comanda de cocina');
    }

    // Crear ticket principal
    const { data: ticket, error: ticketError } = await supabase
      .from('kitchen_tickets')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        sale_id: saleId,
        table_session_id: null,
        status: 'new',
        priority: order.is_scheduled ? 0 : 1,
        estimated_time: estimatedMinutes,
      })
      .select('id')
      .single();

    if (ticketError) {
      console.error('Error creando kitchen_ticket:', ticketError);
      throw new Error(`Error al crear comanda: ${ticketError.message}`);
    }

    // Crear items del ticket
    const ticketItems = saleItems.map(item => ({
      organization_id: order.organization_id,
      kitchen_ticket_id: ticket.id,
      sale_item_id: item.id,
      station: null,
      notes: null,
      status: 'pending',
    }));

    const { error: itemsError } = await supabase
      .from('kitchen_ticket_items')
      .insert(ticketItems);

    if (itemsError) {
      console.error('Error creando kitchen_ticket_items:', itemsError);
      throw new Error(`Error al crear ítems de comanda: ${itemsError.message}`);
    }

    return ticket.id;
  }

  /**
   * Redimir cupón: buscar redemption existente (creada por website) y actualizar sale_id,
   * o crear nueva si no existe (fallback).
   * Website inserta coupon_redemption con sale_id = web_order.id (no es un sale real).
   * ERP corrige ese sale_id con el ID de la venta POS creada.
   */
  private async redeemCoupon(order: WebOrder, saleId: string): Promise<string> {
    try {
      // Buscar redemption existente creada por el website (sale_id = web_order.id)
      const { data: existingRedemption } = await supabase
        .from('coupon_redemptions')
        .select('id')
        .eq('sale_id', order.id)
        .single();

      if (existingRedemption) {
        // UPDATE: corregir sale_id con la venta POS real
        await supabase
          .from('coupon_redemptions')
          .update({ sale_id: saleId })
          .eq('id', existingRedemption.id);

        console.log(`✅ Coupon redemption actualizada con sale_id POS: ${saleId}`);
        return existingRedemption.id;
      }

      // FALLBACK: no encontró redemption del website → crear nueva
      const { data: coupon, error: couponError } = await supabase
        .from('coupons')
        .select('id, usage_count')
        .eq('organization_id', order.organization_id)
        .eq('code', order.coupon_code!)
        .eq('is_active', true)
        .single();

      if (couponError || !coupon) {
        console.warn(`Cupón "${order.coupon_code}" no encontrado o inactivo`);
        return '';
      }

      const { data: redemption, error: redemptionError } = await supabase
        .from('coupon_redemptions')
        .insert({
          coupon_id: coupon.id,
          sale_id: saleId,
          customer_id: order.customer_id || null,
          discount_applied: order.discount_total || 0,
        })
        .select('id')
        .single();

      if (redemptionError) {
        console.error('Error creando coupon_redemption:', redemptionError);
        return '';
      }

      // Solo incrementar usage_count en fallback (website ya lo hizo si creó redemption)
      await supabase
        .from('coupons')
        .update({ usage_count: (coupon.usage_count || 0) + 1 })
        .eq('id', coupon.id);

      return redemption?.id || '';
    } catch (error) {
      console.error('Error redimiendo cupón:', error);
      return '';
    }
  }

  /**
   * Crear shipment automático para pedidos con delivery propio
   */
  private async createShipment(order: WebOrder): Promise<string> {
    try {
      const shipment = await deliveryIntegrationService.createShipmentFromWebOrder(order);
      return shipment.id;
    } catch (error) {
      console.error('Error creando shipment automático:', error);
      // No bloquear la confirmación si falla el shipment
      return '';
    }
  }

  /**
   * Vincular propina online: buscar tip existente (creado por website) y actualizar
   * con sale_id + server_id reales. Si no existe, crear nuevo (fallback).
   * Website crea tip con sale_id=null, server_id='00000...', notes='Propina online - Pedido #WO-...'
   */
  private async createTip(
    order: WebOrder,
    saleId: string,
    userId: string
  ): Promise<string> {
    try {
      // Buscar tip existente creado por el website
      const { data: existingTip } = await supabase
        .from('tips')
        .select('id')
        .eq('organization_id', order.organization_id)
        .eq('branch_id', order.branch_id)
        .eq('tip_type', 'online')
        .ilike('notes', `%${order.order_number}%`)
        .single();

      if (existingTip) {
        // UPDATE: completar con sale_id y server_id reales
        await supabase
          .from('tips')
          .update({ sale_id: saleId, server_id: userId })
          .eq('id', existingTip.id);

        console.log(`✅ Tip online actualizado con sale_id: ${saleId}, server_id: ${userId}`);
        return existingTip.id;
      }

      // FALLBACK: website no creó tip → crear nuevo
      const tip = await PropinasService.create({
        sale_id: saleId,
        server_id: userId,
        amount: order.tip_amount,
        tip_type: 'online',
        notes: `Propina online - Pedido ${order.order_number}`,
      });
      return tip.id;
    } catch (error) {
      console.error('Error vinculando tip online:', error);
      return '';
    }
  }
}

export const webOrderConfirmationService = new WebOrderConfirmationService();
