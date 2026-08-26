import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceNumberWithClient } from '@/lib/utils/invoiceUtils';
import type { WebOrder } from './webOrdersService';

/**
 * Servicio server-side para auto-confirmar pedidos web pagados.
 *
 * A diferencia de `webOrderConfirmationService` (que usa el cliente browser con anon key),
 * este servicio usa la service_role key para funcionar desde API routes / webhooks
 * sin necesidad de sesión de usuario.
 *
 * Al confirmar un pedido pagado crea automáticamente:
 * 1. sale + sale_items (venta POS)
 * 2. Decremento de stock (RPC decrement_stock_with_recipe)
 * 3. Liberación de reserva (qty_reserved)
 * 4. invoice_sales + invoice_items (factura de venta)
 * 5. payment (registro de pago)
 * 6. accounts_receivable (cuenta por cobrar, si hay customer_id)
 * 7. shipment (envío, si es delivery_own o delivery_third_party)
 * 8. Actualiza web_orders con sale_id, status, timestamps
 */

export interface ServerConfirmResult {
  saleId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentId?: string;
  accountReceivableId?: string;
  shipmentId?: string;
  stockErrors: string[];
}

function getServiceRoleClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase environment variables (service role)');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const webOrderServerConfirmation = {
  /**
   * Auto-confirma un pedido web que ya fue pagado.
   * Idempotente: si el pedido ya tiene sale_id, no hace nada.
   *
   * @param orderId - UUID del web_order
   * @returns Resultado de la confirmación
   */
  async autoConfirmPaidOrder(orderId: string): Promise<ServerConfirmResult> {
    const supabase = getServiceRoleClient();

    // 1. Cargar el pedido con items
    const { data: order, error: loadError } = await supabase
      .from('web_orders')
      .select(`*, items:web_order_items(*)`)
      .eq('id', orderId)
      .single();

    if (loadError || !order) {
      throw new Error(`Pedido no encontrado: ${orderId}`);
    }

    // 2. Idempotencia: si ya tiene sale_id, no duplicar
    if (order.sale_id) {
      return {
        saleId: order.sale_id,
        stockErrors: [],
      };
    }

    // 3. Verificar que esté pagado
    if (order.payment_status !== 'paid') {
      throw new Error(`El pedido ${order.order_number} no está pagado (status: ${order.payment_status})`);
    }

    return this.confirmOrder(supabase, order);
  },

  /**
   * Confirma un pedido web creando toda la cadena contable + inventario.
   * Recibe el cliente Supabase ya creado (service role).
   */
  async confirmOrder(
    supabase: SupabaseClient,
    order: WebOrder & { items?: WebOrder['items'] }
  ): Promise<ServerConfirmResult> {
    const now = new Date().toISOString();
    const stockErrors: string[] = [];

    // ── 1. Crear sale (venta POS) ──
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        customer_id: order.customer_id || null,
        user_id: order.confirmed_by || null,
        sale_date: now,
        total: Number(order.total) || 0,
        subtotal: Number(order.subtotal) || 0,
        tax_total: Number(order.tax_total) || 0,
        discount_total: Number(order.discount_total) || 0,
        delivery_fee: Number(order.delivery_fee) || 0,
        tip_amount: Number(order.tip_amount) || 0,
        balance: 0,
        status: 'paid',
        payment_status: 'paid',
        notes: `Pedido web: ${order.order_number}`,
      })
      .select('id')
      .single();

    if (saleError) throw new Error(`Error creando sale: ${saleError.message}`);
    const saleId = sale.id;

    // ── 2. Crear sale_items ──
    const saleItems = (order.items || []).map((item) => ({
      sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: Number(item.unit_price) || 0,
      total: Number(item.total) || 0,
      tax_amount: Number(item.tax_amount) || 0,
      discount_amount: Number(item.discount_amount) || 0,
      notes: {
        product_name: item.product_name,
        from_web_order: order.order_number,
        ...(item.modifiers?.length > 0 ? { modifiers: item.modifiers } : {}),
        ...(item.notes ? { customer_notes: item.notes } : {}),
      },
    }));

    if (saleItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);
      if (itemsError) throw new Error(`Error creando sale_items: ${itemsError.message}`);
    }

    // ── 3. Descontar stock definitivamente (RPC) ──
    for (const item of order.items || []) {
      if (!item.product_id) continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const { error: rpcError } = await supabase.rpc('decrement_stock_with_recipe', {
        p_organization_id: order.organization_id,
        p_branch_id: order.branch_id,
        p_product_id: item.product_id,
        p_qty: qty,
        p_source: 'web_sale',
        p_source_id: String(saleId),
        p_unit_cost: Number(item.unit_price) || null,
        p_updated_by: order.confirmed_by || null,
      });

      if (rpcError) {
        stockErrors.push(`Producto ${item.product_name || item.product_id}: ${rpcError.message}`);
      }
    }

    // ── 4. Liberar reserva (qty_reserved) ──
    for (const item of order.items || []) {
      if (!item.product_id) continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      // Buscar el stock_level para liberar la reserva
      const { data: stockLevel } = await supabase
        .from('stock_levels')
        .select('id, qty_reserved')
        .eq('product_id', item.product_id)
        .eq('branch_id', order.branch_id)
        .is('lot_id', null)
        .limit(1)
        .maybeSingle();

      if (stockLevel) {
        const newReserved = Math.max(0, (Number(stockLevel.qty_reserved) || 0) - qty);
        await supabase
          .from('stock_levels')
          .update({
            qty_reserved: newReserved,
            updated_at: now,
          })
          .eq('id', stockLevel.id);
      }
    }

    // ── 5. Crear factura de venta (invoice_sales + invoice_items) ──
    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;

    try {
      invoiceNumber = await generateInvoiceNumberWithClient(supabase, order.organization_id, 'FACT');

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
          subtotal: Number(order.subtotal) || 0,
          tax_total: Number(order.tax_total) || 0,
          total: Number(order.total) || 0,
          balance: 0,
          status: 'paid',
          payment_method: order.payment_method || 'card',
          payment_terms: 0,
          created_by: order.confirmed_by || null,
          notes: `Factura generada automáticamente desde pedido web ${order.order_number}`,
        })
        .select('id, number')
        .single();

      if (invoiceError) {
        console.error('Error creando invoice_sales:', invoiceError);
      } else {
        invoiceId = invoice.id;
        invoiceNumber = invoice.number;

        // Crear invoice_items
        const invoiceItems = (order.items || []).map((item) => ({
          invoice_id: invoice.id,
          invoice_sales_id: invoice.id,
          invoice_type: 'sale',
          product_id: item.product_id,
          description: (item.product_name || 'Producto web').substring(0, 255),
          qty: item.quantity,
          unit_price: Number(item.unit_price) || 0,
          total_line: Number(item.total) || 0,
          tax_rate: 0,
          discount_amount: Number(item.discount_amount) || 0,
          tax_included: false,
        }));

        if (invoiceItems.length > 0) {
          const { error: invItemsError } = await supabase
            .from('invoice_items')
            .insert(invoiceItems);
          if (invItemsError) {
            console.error('Error creando invoice_items:', invItemsError);
          }
        }
      }
    } catch (invError) {
      console.error('Error en creación de factura:', invError);
    }

    // ── 6. Crear registro de pago (payments) ──
    let paymentId: string | undefined;

    if (invoiceId) {
      try {
        // Verificar si ya existe un pago del webhook de la pasarela
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('source', 'web_order')
          .eq('source_id', order.id)
          .eq('status', 'completed')
          .limit(1)
          .maybeSingle();

        if (existingPayment) {
          // Vincular el pago existente a la factura
          await supabase
            .from('payments')
            .update({ source: 'invoice_sales', source_id: invoiceId })
            .eq('id', existingPayment.id);
          paymentId = existingPayment.id;
        } else {
          // Crear pago nuevo
          const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert({
              organization_id: order.organization_id,
              branch_id: order.branch_id,
              source: 'invoice_sales',
              source_id: invoiceId,
              amount: Number(order.total) || 0,
              method: order.payment_method || 'card',
              currency: 'COP',
              status: 'completed',
              created_by: order.confirmed_by || null,
            })
            .select('id')
            .single();

          if (paymentError) {
            console.error('Error creando payment:', paymentError);
          } else {
            paymentId = payment.id;
          }
        }
      } catch (payError) {
        console.error('Error en creación de pago:', payError);
      }
    }

    // ── 7. Crear cuenta por cobrar (si hay customer_id) ──
    let accountReceivableId: string | undefined;

    if (order.customer_id && invoiceId) {
      try {
        // Verificar si ya existe
        const { data: existingAR } = await supabase
          .from('accounts_receivable')
          .select('id')
          .eq('sale_id', saleId)
          .maybeSingle();

        if (existingAR) {
          accountReceivableId = existingAR.id;
        } else {
          const { data: ar, error: arError } = await supabase
            .from('accounts_receivable')
            .insert({
              organization_id: order.organization_id,
              customer_id: order.customer_id,
              sale_id: saleId,
              amount: Number(order.total) || 0,
              balance: 0,
              due_date: now,
              status: 'paid',
            })
            .select('id')
            .single();

          if (arError) {
            console.error('Error creando accounts_receivable:', arError);
          } else {
            accountReceivableId = ar.id;
          }
        }
      } catch (arError) {
        console.error('Error en creación de cuenta por cobrar:', arError);
      }
    }

    // ── 8. Crear shipment (envío) si es delivery ──
    let shipmentId: string | undefined;

    if (order.delivery_type === 'delivery_own' || order.delivery_type === 'delivery_third_party') {
      try {
        // Verificar si ya existe shipment para este pedido
        const { data: existingShipment } = await supabase
          .from('shipments')
          .select('id')
          .eq('source_type', 'web_order')
          .eq('source_id', order.id)
          .maybeSingle();

        if (existingShipment) {
          shipmentId = existingShipment.id;
        } else {
          const addr = (order.delivery_address || {}) as Record<string, unknown>;
          const trackingNumber = `TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

          const { data: shipment, error: shipmentError } = await supabase
            .from('shipments')
            .insert({
              organization_id: order.organization_id,
              branch_id: order.branch_id,
              source_type: 'web_order',
              source_id: order.id,
              shipment_number: `DEL-${order.order_number}`,
              tracking_number: trackingNumber,
              customer_id: order.customer_id || null,
              delivery_address: (addr.address || addr.street || '') as string,
              delivery_city: (addr.city || '') as string,
              delivery_department: (addr.department || addr.state || addr.neighborhood || '') as string,
              delivery_postal_code: (addr.postal_code || '') as string,
              delivery_latitude: (addr.lat || addr.latitude || null) as number | null,
              delivery_longitude: (addr.lng || addr.longitude || null) as number | null,
              delivery_contact_name: order.customer_name || null,
              delivery_contact_phone: order.customer_phone || null,
              delivery_instructions: (addr.instructions || order.customer_notes || '') as string,
              status: 'pending',
              notes: `Pedido web: ${order.order_number}`,
              metadata: {
                web_order_number: order.order_number,
                web_order_total: order.total,
                items_count: order.items?.length || 0,
                delivery_type: order.delivery_type,
                delivery_partner: order.delivery_partner || null,
              },
            })
            .select('id')
            .single();

          if (shipmentError) {
            console.error('Error creando shipment:', shipmentError);
          } else {
            shipmentId = shipment.id;
          }
        }
      } catch (shipError) {
        console.error('Error en creación de envío:', shipError);
      }
    }

    // ── 9. Actualizar web_orders ──
    const estimatedDeliveryAt = order.delivery_type !== 'pickup'
      ? new Date(Date.now() + 60 * 60000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from('web_orders')
      .update({
        sale_id: saleId,
        status: 'confirmed',
        confirmed_at: now,
        estimated_ready_at: new Date(Date.now() + 30 * 60000).toISOString(),
        ...(estimatedDeliveryAt ? { estimated_delivery_at: estimatedDeliveryAt } : {}),
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Error actualizando web_order:', updateError);
    }

    return {
      saleId,
      invoiceId,
      invoiceNumber,
      paymentId,
      accountReceivableId,
      shipmentId,
      stockErrors,
    };
  },
};
