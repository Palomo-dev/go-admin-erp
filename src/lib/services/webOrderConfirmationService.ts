import { supabase } from '@/lib/supabase/config';
import { getCurrentUserId } from '@/lib/hooks/useOrganization';
import { PropinasService } from '@/components/pos/propinas/propinasService';
import { deliveryIntegrationService } from './deliveryIntegrationService';
import { stockMovementService } from './stockMovementService';
import { generateInvoiceNumber } from '@/lib/utils/invoiceUtils';
import type { WebOrder } from './webOrdersService';

/**
 * Sub-métodos de Wompi (pasarela de pago del website).
 * Ver webOrderServerConfirmation.ts para detalles del mapeo.
 */
const WOMPI_SUB_METHODS = new Set([
  'nequi', 'card', 'pse', 'bancolombia_transfer',
  'bancolombia_collect', 'daviplata', 'wompi',
]);

function mapWebPaymentMethodToInvoice(method: string | null | undefined): string {
  if (!method) return 'wompi';
  if (WOMPI_SUB_METHODS.has(method)) return 'wompi';
  return method;
}

export interface ConfirmOrderResult {
  saleId: string;
  kitchenTicketId: number;
  tipId?: string;
  shipmentId?: string;
  couponRedemptionId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  accountReceivableId?: string;
  paymentId?: string;
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
    options: {
      prepMs: number;
      transitMs?: number;
      markAsPaid?: boolean;
    }
  ): Promise<ConfirmOrderResult> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No se pudo obtener el usuario actual');

    const now = new Date().toISOString();
    const estimatedReadyAt = new Date(Date.now() + options.prepMs).toISOString();

    // Si se marca como pagado, sobrescribir payment_status del pedido
    const markAsPaid = options.markAsPaid ?? false;
    const effectivePaymentStatus = markAsPaid ? 'paid' : order.payment_status;
    const orderForSale = markAsPaid ? { ...order, payment_status: 'paid' as const } : order;

    // 1. Crear sale (venta POS)
    const saleId = await this.createSale(orderForSale, userId);

    // 2. Crear sale_items y obtener los IDs insertados
    const insertedSaleItems = await this.createSaleItems(order, saleId);

    // 2b. Descontar stock definitivamente y liberar reserva
    try {
      const stockResult = await stockMovementService.decrementOnSale(
        order.organization_id,
        order.branch_id,
        saleId,
        (order.items || []).map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        'web_sale',
        userId
      );
      if (stockResult.errors.length > 0) {
        console.warn('⚠️ Algunos items no descontaron stock:', stockResult.errors);
      }
      console.log(`📦 Stock descontado (web order confirm): ${(order.items || []).length - stockResult.skipped} items`);

      // Liberar reserva (qty_reserved) ya que el stock fue descontado definitivamente
      await stockMovementService.releaseStockReservation(
        order.branch_id,
        order.id,
        (order.items || []).map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }))
      );
    } catch (stockError) {
      console.warn('⚠️ Error descontando stock (no bloquea la confirmación):', stockError);
    }

    // 3. Crear kitchen_ticket + kitchen_ticket_items
    const kitchenTicketId = await this.createKitchenTicket(
      order,
      saleId,
      insertedSaleItems,
      Math.round(options.prepMs / 60000)
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

    // 6. Crear shipment automático para pedidos con delivery (propio o tercero)
    let shipmentId: string | undefined;
    if (order.delivery_type === 'delivery_own' || order.delivery_type === 'delivery_third_party') {
      shipmentId = await this.createShipment(order);
    }

    // 7. Crear factura de venta (invoice_sales) + invoice_items si el pedido está pagado
    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;
    let accountReceivableId: string | undefined;
    let paymentId: string | undefined;

    if (effectivePaymentStatus === 'paid') {
      const invoiceResult = await this.createInvoice(order, saleId, userId);
      invoiceId = invoiceResult.invoiceId;
      invoiceNumber = invoiceResult.invoiceNumber;

      // 8. Crear registro de pago (payments) asociado a la factura
      if (invoiceId) {
        paymentId = await this.createPayment(order, invoiceId, userId);
      }

      // 9. Crear cuenta por cobrar si hay cliente y balance pendiente
      // (la cuenta por cobrar también la crea un trigger al insertar la factura,
      //  pero la creamos explícitamente para garantizar consistencia con customer_id)
      if (order.customer_id && invoiceId) {
        accountReceivableId = await this.createAccountReceivable(order, saleId);
      }
    }

    // 10. Calcular estimated_delivery_at para pedidos delivery
    //     = Listo aprox + tiempo de traslado (definido por el operario)
    const estimatedDeliveryAt = order.delivery_type !== 'pickup' && options.transitMs && options.transitMs > 0
      ? new Date(Date.now() + options.prepMs + options.transitMs).toISOString()
      : undefined;

    // 11. Actualizar web_orders: sale_id + status + timestamps
    const { error: updateError } = await supabase
      .from('web_orders')
      .update({
        sale_id: saleId,
        status: 'confirmed',
        payment_status: effectivePaymentStatus,
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

    return { saleId, kitchenTicketId, tipId, shipmentId, couponRedemptionId, invoiceId, invoiceNumber, accountReceivableId, paymentId };
  }

  /**
   * Crear venta web a partir de un web_order
   * source='web' e include_in_cash_register=false para que no aparezca en caja POS.
   * sale_date usa la fecha original del pedido, no la fecha de confirmación.
   */
  private async createSale(order: WebOrder, userId: string): Promise<string> {
    const saleDate = order.created_at || new Date().toISOString();
    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        customer_id: order.customer_id || null,
        user_id: userId,
        sale_date: saleDate,
        total: order.total,
        subtotal: order.subtotal,
        tax_total: order.tax_total,
        discount_total: order.discount_total,
        delivery_fee: Number(order.delivery_fee) || 0,
        tip_amount: Number(order.tip_amount) || 0,
        balance: order.payment_status === 'paid' ? 0 : order.total,
        status: order.payment_status === 'paid' ? 'paid' : 'pending',
        payment_status: order.payment_status || 'pending',
        source: 'web',
        include_in_cash_register: false,
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
   * Crear shipment automático para pedidos con delivery (propio o tercero)
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
   * Crear factura de venta (invoice_sales + invoice_items) a partir de un web_order pagado.
   * Sigue el mismo patrón que POSService.checkout para mantener consistencia contable.
   */
  private async createInvoice(
    order: WebOrder,
    saleId: string,
    userId: string
  ): Promise<{ invoiceId: string; invoiceNumber: string }> {
    try {
      const invoiceNumber = await generateInvoiceNumber(order.organization_id, 'FACT');
      const now = new Date().toISOString();

      // Calcular totales incluyendo delivery_fee
      const subtotal = Number(order.subtotal) || 0;
      const taxTotal = Number(order.tax_total) || 0;
      const discountTotal = Number(order.discount_total) || 0;
      const deliveryFee = Number(order.delivery_fee) || 0;
      const total = Number(order.total) || (subtotal + taxTotal - discountTotal + deliveryFee);

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          customer_id: order.customer_id || null,
          sale_id: saleId,
          number: invoiceNumber,
          issue_date: now,
          due_date: now,
          currency: 'COP',
          subtotal,
          tax_total: taxTotal,
          total,
          balance: 0, // Pedido pagado → balance 0
          status: 'paid',
          payment_method: mapWebPaymentMethodToInvoice(order.payment_method),
          payment_terms: 0,
          created_by: userId,
          notes: `Factura generada automáticamente desde pedido web ${order.order_number}`,
        })
        .select('id, number')
        .single();

      if (invoiceError) {
        console.error('Error creando invoice_sales:', invoiceError);
        return { invoiceId: '', invoiceNumber: '' };
      }

      // Crear invoice_items a partir de web_order_items
      const productItems = (order.items || []).map(item => ({
        invoice_id: invoice.id,
        invoice_sales_id: invoice.id,
        invoice_type: 'sale',
        product_id: item.product_id,
        description: item.product_name?.substring(0, 255) || 'Producto web',
        qty: item.quantity,
        unit_price: Number(item.unit_price) || 0,
        total_line: Number(item.total) || 0,
        tax_rate: 0,
        discount_amount: Number(item.discount_amount) || 0,
        tax_included: false,
      }));

      // Línea de envío (delivery_fee): el trigger fn_recalc_invoice_totals
      // recalcula total = SUM(invoice_items) al insertar las líneas. Si no se
      // incluye el envío como una línea, el total de la factura queda en solo
      // los productos y se desincroniza con sale.total (que sí incluye envío),
      // generando además un "overpayment" del pago web frente a la factura.
      // `deliveryFee` fue calculado arriba en el bloque de totales.
      const invoiceItems = [
        ...productItems,
        ...(deliveryFee > 0
          ? [{
              invoice_id: invoice.id,
              invoice_sales_id: invoice.id,
              invoice_type: 'sale',
              product_id: null,
              description: 'Envío (Delivery)',
              qty: 1,
              unit_price: deliveryFee,
              total_line: deliveryFee,
              tax_rate: 0,
              discount_amount: 0,
              tax_included: false,
            }]
          : []),
      ];

      if (invoiceItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(invoiceItems);

        if (itemsError) {
          console.error('Error creando invoice_items:', itemsError);
        }
      }

      console.log(`📄 Factura creada: ${invoice.number} para pedido web ${order.order_number}`);
      return { invoiceId: invoice.id, invoiceNumber: invoice.number };
    } catch (error) {
      console.error('Error en createInvoice:', error);
      return { invoiceId: '', invoiceNumber: '' };
    }
  }

  /**
   * Crear registro de pago (payments) asociado a la factura.
   * Si ya existe un pago creado por el webhook de la pasarela, no duplicar.
   */
  private async createPayment(
    order: WebOrder,
    invoiceId: string,
    userId: string
  ): Promise<string> {
    try {
      // Verificar si ya existe un pago para este web_order (creado por webhook/website).
      // El website inserta el payment con status='paid', mientras que el ERP usa
      // 'completed'. Aceptar ambos para evitar duplicar el pago (y la notificación
      // que dispara el trigger trg_notify_payment_registered).
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('source', 'web_order')
        .eq('source_id', order.id)
        .in('status', ['paid', 'completed'])
        .limit(1)
        .maybeSingle();

      if (existingPayment) {
        // Ya existe pago del webhook/website — vincularlo a la factura.
        // Mapear el submétodo (nequi, daviplata, pse, card) a la pasarela real
        // (wompi) para que la notificación muestre el método correcto.
        // Normalizar status a 'completed': el website inserta el payment con
        // status='paid', pero fn_invoice_sales_paid (usada por los triggers
        // fn_recalc_invoice_totals / fn_recalc_invoice_balance_from_payments)
        // SOLO cuenta pagos con status='completed'. Sin esta normalización la
        // factura queda con balance=total aunque el pago exista, y se crea una
        // cuenta por cobrar fantasma con saldo.
        const mappedMethod = mapWebPaymentMethodToInvoice(order.payment_method);
        await supabase
          .from('payments')
          .update({
            source: 'invoice_sales',
            source_id: invoiceId,
            method: mappedMethod,
            status: 'completed',
          })
          .eq('id', existingPayment.id);

        // El trigger trg_notify_payment_registered ya creó una notificación con
        // el submétodo (ej: "Método: nequi") al insertarse el payment del website.
        // Corregir el contenido para que muestre la pasarela real (wompi).
        await this.fixPaymentNotificationMethod(
          order.organization_id,
          existingPayment.id,
          mappedMethod,
        );

        return existingPayment.id;
      }

      // Crear pago nuevo asociado a la factura
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          source: 'invoice_sales',
          source_id: invoiceId,
          amount: Number(order.total) || 0,
          method: mapWebPaymentMethodToInvoice(order.payment_method),
          currency: 'COP',
          status: 'completed',
          created_by: userId,
        })
        .select('id')
        .single();

      if (paymentError) {
        console.error('Error creando payment:', paymentError);
        return '';
      }

      return payment.id;
    } catch (error) {
      console.error('Error en createPayment:', error);
      return '';
    }
  }

  /**
   * Corrige el contenido de la notificación de "pago registrado" que creó el
   * trigger trg_notify_payment_registered al insertarse el payment del website.
   * El trigger usa NEW.method (el submétodo: nequi, daviplata, etc.), pero el
   * método real es la pasarela (wompi). Actualiza el payload de la notificación
   * existente para que muestre el método correcto.
   */
  private async fixPaymentNotificationMethod(
    organizationId: number,
    paymentId: string,
    correctMethod: string,
  ): Promise<void> {
    try {
      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .select('id, payload')
        .eq('organization_id', organizationId)
        .eq('payload->>payment_id', paymentId)
        .eq('payload->>type', 'payment_registered')
        .limit(1)
        .maybeSingle();

      if (notifError || !notif) return;

      const currentPayload = notif.payload as Record<string, unknown>;
      const amount = currentPayload.amount as string | undefined;
      const updatedContent = `Se registró un pago de $${amount ?? '0'} — Método: ${correctMethod}`;

      await supabase
        .from('notifications')
        .update({
          payload: { ...currentPayload, content: updatedContent },
          updated_at: new Date().toISOString(),
        })
        .eq('id', notif.id);
    } catch (err) {
      // No fallar la confirmación si la corrección de notificación falla
      console.warn('No se pudo corregir la notificación de pago:', err);
    }
  }

  /**
   * Crear cuenta por cobrar (accounts_receivable) para el cliente.
   * Aunque el pedido esté pagado (balance 0), se crea el registro para trazabilidad.
   */
  private async createAccountReceivable(
    order: WebOrder,
    saleId: string
  ): Promise<string> {
    try {
      // Verificar si ya existe una cuenta por cobrar para esta venta
      const { data: existingAR } = await supabase
        .from('accounts_receivable')
        .select('id')
        .eq('sale_id', saleId)
        .maybeSingle();

      if (existingAR) return existingAR.id;

      const total = Number(order.total) || 0;
      const { data: ar, error: arError } = await supabase
        .from('accounts_receivable')
        .insert({
          organization_id: order.organization_id,
          customer_id: order.customer_id!,
          sale_id: saleId,
          amount: total,
          balance: 0, // Pedido pagado → balance 0
          due_date: new Date().toISOString(),
          status: 'paid',
        })
        .select('id')
        .single();

      if (arError) {
        console.error('Error creando accounts_receivable:', arError);
        return '';
      }

      return ar.id;
    } catch (error) {
      console.error('Error en createAccountReceivable:', error);
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
