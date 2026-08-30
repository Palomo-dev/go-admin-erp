import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceNumberWithClient } from '@/lib/utils/invoiceUtils';
import type { WebOrder } from './webOrdersService';

/**
 * Sub-métodos de Wompi (pasarela de pago del website).
 * El campo `web_orders.payment_method` guarda el sub-método elegido por el cliente
 * (nequi, pse, card, etc.), pero `invoice_sales.payment_method` tiene FK a
 * `payment_methods` que solo contiene la pasarela real. Mapeamos todos los
 * sub-métodos de Wompi a 'wompi'.
 */
const WOMPI_SUB_METHODS = new Set([
  'nequi',
  'card',
  'pse',
  'bancolombia_transfer',
  'bancolombia_collect',
  'daviplata',
  'wompi',
]);

function mapWebPaymentMethodToInvoice(method: string | null | undefined): string {
  if (!method) return 'wompi';
  if (WOMPI_SUB_METHODS.has(method)) return 'wompi';
  return method;
}

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
   * Busca o crea un cliente en `customers` a partir del email/teléfono del
   * pedido web, para que la venta entre en cartera (accounts_receivable) y en
   * el CRM aunque el checkout no haya traído `customer_id`.
   *
   * Mismo patrón que usa `/api/restaurant-reservations` (reservas de mesa).
   * Respeta Habeas Data: el cliente web ya consintió al hacer el pedido.
   *
   * @returns id del customer (existente o recién creado) o null si no hay email.
   */
  async findOrCreateCustomerFromOrder(
    supabase: SupabaseClient,
    order: WebOrder & { items?: WebOrder['items'] }
  ): Promise<string | null> {
    // Si ya viene customer_id, no hacer nada
    if (order.customer_id) return order.customer_id;

    const email = (order.customer_email || '').trim().toLowerCase();
    const phone = (order.customer_phone || '').trim() || null;
    const name = (order.customer_name || '').trim() || 'Cliente web';

    // Sin email no podemos vincular de forma fiable (el phone puede repetirse)
    if (!email) return null;

    // 1. Buscar cliente existente por email dentro de la organización
    const { data: existing, error: searchError } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', order.organization_id)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (searchError) {
      console.error('[webOrderServerConfirmation] Error buscando cliente por email:', searchError);
      return null;
    }

    if (existing?.id) {
      // Vincular el pedido al cliente encontrado
      await supabase
        .from('web_orders')
        .update({ customer_id: existing.id })
        .eq('id', order.id);
      return existing.id;
    }

    // 2. Crear cliente nuevo
    // Nota: full_name es GENERATED ALWAYS (first_name || ' ' || last_name),
    // no se puede insertar directamente.
    // La tabla customers no tiene columnas country/state — el país se infiere
    // vía fiscal_municipality_id, pero guardamos la info de envío en metadata.
    const addr = (order.delivery_address || {}) as Record<string, unknown>;
    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id || null,
        first_name: name,
        email,
        phone,
        is_registered: false,
        roles: ['cliente'],
        metadata: {
          source: 'web_order',
          web_order_number: order.order_number,
          country: (addr.country || null) as string | null,
          state: (addr.state || addr.department || null) as string | null,
          state_code: (addr.state_code || null) as string | null,
        },
      })
      .select('id')
      .single();

    if (createError || !newCustomer) {
      console.error('[webOrderServerConfirmation] Error creando cliente web:', createError);
      return null;
    }

    // Vincular el pedido al nuevo cliente
    await supabase
      .from('web_orders')
      .update({ customer_id: newCustomer.id })
      .eq('id', order.id);

    return newCustomer.id;
  },

  /**
   * Crea una dirección en `customer_addresses` para el cliente resuelto, pero
   * solo si el cliente aún no tiene ninguna dirección registrada.
   *
   * La tabla `customers` no guarda país/estado directamente (se infiere vía
   * `fiscal_municipality_id`), así que la dirección de envío del pedido web se
   * persiste aquí en `customer_addresses` que sí tiene `country_code`,
   * `department`, `city` y `municipality_id`.
   */
  async ensureCustomerAddressFromOrder(
    supabase: SupabaseClient,
    order: WebOrder & { items?: WebOrder['items'] },
    customerId: string
  ): Promise<void> {
    const addr = (order.delivery_address || {}) as Record<string, unknown>;
    const addressLine = (addr.address || addr.street || '') as string;
    const city = (addr.city || '') as string;

    // Solo proceder si hay datos mínimos de dirección
    if (!addressLine || !city) return;

    try {
      // Verificar si el cliente ya tiene direcciones
      const { data: existingAddresses, error: checkError } = await supabase
        .from('customer_addresses')
        .select('id')
        .eq('organization_id', order.organization_id)
        .eq('customer_id', customerId)
        .limit(1);

      if (checkError) {
        console.error('[webOrderServerConfirmation] Error verificando direcciones del cliente:', checkError);
        return;
      }

      // Si ya tiene al menos una dirección, no crear otra
      if (existingAddresses && existingAddresses.length > 0) return;

      const { error: addrError } = await supabase
        .from('customer_addresses')
        .insert({
          organization_id: order.organization_id,
          customer_id: customerId,
          label: 'Principal',
          recipient_name: order.customer_name || '',
          recipient_phone: order.customer_phone || '',
          address_line1: addressLine,
          city,
          department: (addr.department || addr.state || '') as string,
          country_code: (addr.country || null) as string | null,
          postal_code: (addr.postal_code || null) as string | null,
          latitude: (addr.lat || addr.latitude || null) as number | null,
          longitude: (addr.lng || addr.longitude || null) as number | null,
          delivery_instructions: (addr.instructions || '') as string,
          is_default: true,
          is_active: true,
        });

      if (addrError) {
        console.error('[webOrderServerConfirmation] Error creando customer_address:', addrError);
      }
    } catch (addrErr) {
      console.error('[webOrderServerConfirmation] Error en ensureCustomerAddressFromOrder:', addrErr);
    }
  },

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
   * Resuelve un user_id válido para registros que requieren NOT NULL (sales.user_id).
   * Prioriza `confirmed_by` del pedido; si es null (pedido auto-confirmado por
   * webhook del website sin sesión de usuario), usa `organizations.created_by`
   * (el creador/owner de la organización) como fallback.
   */
  async resolveUserId(
    supabase: SupabaseClient,
    order: WebOrder & { items?: WebOrder['items'] }
  ): Promise<string | null> {
    if (order.confirmed_by) return order.confirmed_by;

    try {
      const { data: org, error } = await supabase
        .from('organizations')
        .select('created_by')
        .eq('id', order.organization_id)
        .maybeSingle();

      if (error || !org?.created_by) {
        console.warn('[webOrderServerConfirmation] No se pudo resolver user_id fallback (organizations.created_by):', error?.message);
        return null;
      }
      return org.created_by as string;
    } catch (err) {
      console.warn('[webOrderServerConfirmation] Error resolviendo user_id fallback:', err);
      return null;
    }
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

    // ── 0. Cliente automático: buscar/crear customer por email ──
    // Si el pedido no trae customer_id, intentamos vincularlo a un cliente
    // existente (por email) o crear uno nuevo, para que la venta entre en
    // cartera (accounts_receivable) y en el CRM. (F11.6)
    let customerId = order.customer_id || null;
    if (!customerId) {
      try {
        customerId = await this.findOrCreateCustomerFromOrder(supabase, order);
        if (customerId) {
          // Actualizar la referencia local para el resto del flujo
          (order as { customer_id?: string | null }).customer_id = customerId;
        }
      } catch (custError) {
        console.error('[webOrderServerConfirmation] Error en cliente automático:', custError);
      }
    }

    // ── 0a. Persistir dirección de envío en customer_addresses ──
    // Si se resolvió un cliente (venga del pedido o se creó/encontró ahora),
    // y el pedido trae dirección de envío con country/state/city, crear el
    // registro de dirección solo si el cliente no tiene ninguna aún.
    if (customerId) {
      try {
        await this.ensureCustomerAddressFromOrder(supabase, order, customerId);
      } catch (addrError) {
        console.error('[webOrderServerConfirmation] Error persistiendo dirección del cliente:', addrError);
      }
    }

    // ── 0b. Resolver user_id (sales.user_id es NOT NULL) ──
    // Para pedidos auto-confirmados por webhook sin sesión de usuario,
    // usar organizations.created_by como fallback.
    const userId = await this.resolveUserId(supabase, order);

    // ── 1. Crear sale (venta web) ──
    // source='web' e include_in_cash_register=false para que no aparezca en caja POS.
    // sale_date usa la fecha original del pedido (created_at), no la fecha de
    // reconciliación, para que las estadísticas diarias sean correctas.
    // confirmed_at puede tener la fecha de la reconciliación, no la del pedido.
    const saleDate = order.created_at || now;
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        organization_id: order.organization_id,
        branch_id: order.branch_id,
        customer_id: customerId,
        user_id: userId,
        sale_date: saleDate,
        total: Number(order.total) || 0,
        subtotal: Number(order.subtotal) || 0,
        tax_total: Number(order.tax_total) || 0,
        discount_total: Number(order.discount_total) || 0,
        delivery_fee: Number(order.delivery_fee) || 0,
        tip_amount: Number(order.tip_amount) || 0,
        balance: 0,
        status: 'paid',
        payment_status: 'paid',
        source: 'web',
        include_in_cash_register: false,
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
        ...((item.modifiers?.length ?? 0) > 0 ? { modifiers: item.modifiers } : {}),
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
        p_updated_by: userId,
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
          customer_id: customerId,
          sale_id: saleId,
          number: invoiceNumber,
          issue_date: saleDate,
          due_date: saleDate,
          currency: 'COP',
          subtotal: Number(order.subtotal) || 0,
          tax_total: Number(order.tax_total) || 0,
          total: Number(order.total) || 0,
          balance: 0,
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
      } else {
        invoiceId = invoice.id;
        invoiceNumber = invoice.number;

        // Crear invoice_items a partir de web_order_items
        const productItems = (order.items || []).map((item) => ({
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

        // Línea de envío (delivery_fee): el trigger fn_recalc_invoice_totals
        // recalcula total = SUM(invoice_items) al insertar las líneas. Si no se
        // incluye el envío como una línea, el total de la factura queda en solo
        // los productos y se desincroniza con sale.total (que sí incluye envío),
        // generando además un "overpayment" del pago web frente a la factura.
        const deliveryFee = Number(order.delivery_fee) || 0;
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
              method: mapWebPaymentMethodToInvoice(order.payment_method),
              currency: 'COP',
              status: 'completed',
              created_by: userId,
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

    if (customerId && invoiceId) {
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
              customer_id: customerId,
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

          // La tabla shipments no tiene columna delivery_country, así que el
          // país se persiste en metadata (jsonb) y se anexa a delivery_instructions.
          const country = (addr.country || '') as string;
          const stateCode = (addr.state_code || '') as string;
          const baseInstructions = (addr.instructions || order.customer_notes || '') as string;
          const deliveryInstructions = country
            ? `${baseInstructions}${baseInstructions ? ' | ' : ''}País: ${country}${stateCode ? ` (${stateCode})` : ''}`
            : baseInstructions;

          const { data: shipment, error: shipmentError } = await supabase
            .from('shipments')
            .insert({
              organization_id: order.organization_id,
              branch_id: order.branch_id,
              source_type: 'web_order',
              source_id: order.id,
              shipment_number: `DEL-${order.order_number}`,
              tracking_number: trackingNumber,
              customer_id: customerId,
              delivery_address: (addr.address || addr.street || '') as string,
              delivery_city: (addr.city || '') as string,
              delivery_department: (addr.department || addr.state || addr.neighborhood || '') as string,
              delivery_postal_code: (addr.postal_code || '') as string,
              delivery_latitude: (addr.lat || addr.latitude || null) as number | null,
              delivery_longitude: (addr.lng || addr.longitude || null) as number | null,
              delivery_contact_name: order.customer_name || null,
              delivery_contact_phone: order.customer_phone || null,
              delivery_instructions: deliveryInstructions,
              status: 'pending',
              notes: `Pedido web: ${order.order_number}`,
              metadata: {
                web_order_number: order.order_number,
                web_order_total: order.total,
                items_count: order.items?.length || 0,
                delivery_type: order.delivery_type,
                delivery_partner: order.delivery_partner || null,
                delivery_country: country || null,
                delivery_state: (addr.state || addr.department || '') as string,
                delivery_state_code: stateCode || null,
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
