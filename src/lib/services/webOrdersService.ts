import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export type WebOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'in_delivery' | 'delivered' | 'cancelled' | 'rejected';
export type DeliveryType = 'pickup' | 'delivery_own' | 'delivery_third_party';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'failed';
export type OrderSource = 'website' | 'mobile_app' | 'whatsapp' | 'phone';

export interface WebOrderItem {
  id: string;
  web_order_id: string;
  product_id: number | null;
  product_name: string;
  product_sku?: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  modifiers?: any[];
  notes?: string;
  status: 'pending' | 'preparing' | 'ready' | 'cancelled';
  created_at: string;
}

export interface WebOrder {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  order_number: string;
  status: WebOrderStatus;
  source: OrderSource;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  delivery_fee: number;
  tip_amount: number;
  total: number;
  delivery_type: DeliveryType;
  delivery_partner?: string;
  delivery_address?: {
    address?: string;
    city?: string;
    neighborhood?: string;
    instructions?: string;
    lat?: number;
    lng?: number;
  };
  is_scheduled: boolean;
  scheduled_at?: string;
  estimated_ready_at?: string;
  estimated_delivery_at?: string;
  payment_status: PaymentStatus;
  payment_method?: string;
  payment_reference?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_notes?: string;
  internal_notes?: string;
  sale_id?: string;
  confirmed_at?: string;
  confirmed_by?: string;
  ready_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  items?: WebOrderItem[];
  customer?: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
  };
  branch?: {
    id: number;
    name: string;
  };
}

export interface CreateWebOrderInput {
  branch_id: number;
  customer_id?: string;
  source?: OrderSource;
  delivery_type: DeliveryType;
  delivery_partner?: string;
  delivery_address?: WebOrder['delivery_address'];
  delivery_fee?: number;
  is_scheduled?: boolean;
  scheduled_at?: string;
  payment_method?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_notes?: string;
  items: {
    product_id?: number;
    product_name: string;
    product_sku?: string;
    quantity: number;
    unit_price: number;
    tax_amount?: number;
    discount_amount?: number;
    modifiers?: any[];
    notes?: string;
  }[];
}

export interface WebOrderFilters {
  status?: WebOrderStatus[];
  delivery_type?: DeliveryType;
  source?: OrderSource;
  payment_status?: PaymentStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
  branch_id?: number;
}

class WebOrdersService {
  private get organizationId() {
    return getOrganizationId();
  }

  private get branchId() {
    return getCurrentBranchId();
  }

  /**
   * Obtener todos los pedidos web con filtros
   */
  async getOrders(filters?: WebOrderFilters): Promise<WebOrder[]> {
    try {
      let query = supabase
        .from('web_orders')
        .select(`
          *,
          items:web_order_items(*),
          customer:customers(id, full_name, email, phone),
          branch:branches(id, name)
        `)
        .eq('organization_id', this.organizationId)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.delivery_type) {
        query = query.eq('delivery_type', filters.delivery_type);
      }

      if (filters?.source) {
        query = query.eq('source', filters.source);
      }

      if (filters?.payment_status) {
        query = query.eq('payment_status', filters.payment_status);
      }

      if (filters?.branch_id) {
        query = query.eq('branch_id', filters.branch_id);
      }

      if (filters?.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters?.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      if (filters?.search) {
        query = query.or(`order_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching web orders:', error);
      throw error;
    }
  }

  /**
   * Obtener pedidos pendientes (para notificaciones en tiempo real)
   */
  async getPendingOrders(): Promise<WebOrder[]> {
    return this.getOrders({ status: ['pending', 'confirmed', 'preparing', 'ready', 'in_delivery'] });
  }

  /**
   * Obtener un pedido por ID
   */
  async getOrderById(orderId: string): Promise<WebOrder | null> {
    try {
      const { data, error } = await supabase
        .from('web_orders')
        .select(`
          *,
          items:web_order_items(*),
          customer:customers(id, full_name, email, phone, address, city),
          branch:branches(id, name, address, phone)
        `)
        .eq('id', orderId)
        .eq('organization_id', this.organizationId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching web order:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo pedido web
   */
  async createOrder(input: CreateWebOrderInput): Promise<WebOrder> {
    try {
      // Generar número de pedido
      const { data: orderNumber } = await supabase
        .rpc('generate_web_order_number', { org_id: this.organizationId });

      // Calcular totales
      let subtotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;

      const itemsWithTotals = input.items.map(item => {
        const itemTotal = item.quantity * item.unit_price;
        const taxAmount = item.tax_amount || 0;
        const discountAmount = item.discount_amount || 0;
        
        subtotal += itemTotal;
        taxTotal += taxAmount * item.quantity;
        discountTotal += discountAmount * item.quantity;

        return {
          ...item,
          total: itemTotal - (discountAmount * item.quantity) + (taxAmount * item.quantity),
          tax_amount: taxAmount,
          discount_amount: discountAmount,
        };
      });

      const deliveryFee = input.delivery_fee || 0;
      const total = subtotal + taxTotal - discountTotal + deliveryFee;

      // Crear pedido
      const { data: order, error: orderError } = await supabase
        .from('web_orders')
        .insert({
          organization_id: this.organizationId,
          branch_id: input.branch_id,
          customer_id: input.customer_id,
          order_number: orderNumber || `WO-${Date.now()}`,
          status: 'pending',
          source: input.source || 'website',
          subtotal,
          tax_total: taxTotal,
          discount_total: discountTotal,
          delivery_fee: deliveryFee,
          total,
          delivery_type: input.delivery_type,
          delivery_partner: input.delivery_partner,
          delivery_address: input.delivery_address || {},
          is_scheduled: input.is_scheduled || false,
          scheduled_at: input.scheduled_at,
          payment_status: 'pending',
          payment_method: input.payment_method,
          customer_name: input.customer_name,
          customer_email: input.customer_email,
          customer_phone: input.customer_phone,
          customer_notes: input.customer_notes,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Crear items
      const orderItems = itemsWithTotals.map(item => ({
        web_order_id: order.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_amount: item.tax_amount,
        discount_amount: item.discount_amount,
        total: item.total,
        modifiers: item.modifiers || [],
        notes: item.notes,
        status: 'pending',
      }));

      const { error: itemsError } = await supabase
        .from('web_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return this.getOrderById(order.id) as Promise<WebOrder>;
    } catch (error) {
      console.error('Error creating web order:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado del pedido
   */
  async updateOrderStatus(
    orderId: string, 
    status: WebOrderStatus, 
    options?: { 
      cancellation_reason?: string;
      internal_notes?: string;
      estimated_ready_at?: string;
      estimated_delivery_at?: string;
    }
  ): Promise<WebOrder> {
    try {
      const updateData: any = { status };
      const now = new Date().toISOString();

      // Campos específicos según el estado
      switch (status) {
        case 'confirmed':
          updateData.confirmed_at = now;
          if (options?.estimated_ready_at) {
            updateData.estimated_ready_at = options.estimated_ready_at;
          }
          break;
        case 'ready':
          updateData.ready_at = now;
          break;
        case 'delivered':
          updateData.delivered_at = now;
          break;
        case 'cancelled':
        case 'rejected':
          updateData.cancelled_at = now;
          updateData.cancellation_reason = options?.cancellation_reason;
          break;
      }

      if (options?.internal_notes) {
        updateData.internal_notes = options.internal_notes;
      }

      if (options?.estimated_delivery_at) {
        updateData.estimated_delivery_at = options.estimated_delivery_at;
      }

      const { error } = await supabase
        .from('web_orders')
        .update(updateData)
        .eq('id', orderId)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      return this.getOrderById(orderId) as Promise<WebOrder>;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Confirmar pedido
   */
  async confirmOrder(orderId: string, estimatedReadyMinutes?: number): Promise<WebOrder> {
    const estimatedReadyAt = estimatedReadyMinutes 
      ? new Date(Date.now() + estimatedReadyMinutes * 60000).toISOString()
      : undefined;

    return this.updateOrderStatus(orderId, 'confirmed', { estimated_ready_at: estimatedReadyAt });
  }

  /**
   * Marcar como en preparación
   */
  async startPreparing(orderId: string): Promise<WebOrder> {
    return this.updateOrderStatus(orderId, 'preparing');
  }

  /**
   * Marcar como listo
   */
  async markAsReady(orderId: string): Promise<WebOrder> {
    return this.updateOrderStatus(orderId, 'ready');
  }

  /**
   * Marcar como en camino (delivery)
   */
  async startDelivery(orderId: string, estimatedDeliveryMinutes?: number): Promise<WebOrder> {
    const estimatedDeliveryAt = estimatedDeliveryMinutes
      ? new Date(Date.now() + estimatedDeliveryMinutes * 60000).toISOString()
      : undefined;

    return this.updateOrderStatus(orderId, 'in_delivery', { estimated_delivery_at: estimatedDeliveryAt });
  }

  /**
   * Marcar como entregado
   */
  async markAsDelivered(orderId: string): Promise<WebOrder> {
    return this.updateOrderStatus(orderId, 'delivered');
  }

  /**
   * Cancelar pedido
   */
  async cancelOrder(orderId: string, reason: string): Promise<WebOrder> {
    return this.updateOrderStatus(orderId, 'cancelled', { cancellation_reason: reason });
  }

  /**
   * Rechazar pedido
   */
  async rejectOrder(orderId: string, reason: string): Promise<WebOrder> {
    return this.updateOrderStatus(orderId, 'rejected', { cancellation_reason: reason });
  }

  /**
   * Actualizar estado de pago
   */
  async updatePaymentStatus(
    orderId: string, 
    paymentStatus: PaymentStatus, 
    paymentReference?: string
  ): Promise<WebOrder> {
    try {
      const { error } = await supabase
        .from('web_orders')
        .update({ 
          payment_status: paymentStatus,
          payment_reference: paymentReference 
        })
        .eq('id', orderId)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      return this.getOrderById(orderId) as Promise<WebOrder>;
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw error;
    }
  }

  /**
   * Convertir pedido a venta (cuando se completa)
   */
  async convertToSale(orderId: string): Promise<{ saleId: string }> {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) throw new Error('Pedido no encontrado');

      // Crear venta
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          organization_id: order.organization_id,
          branch_id: order.branch_id,
          customer_id: order.customer_id,
          user_id: order.confirmed_by,
          total: order.total,
          subtotal: order.subtotal,
          tax_total: order.tax_total,
          discount_total: order.discount_total,
          balance: 0,
          status: 'paid',
          payment_status: 'paid',
          notes: `Pedido web: ${order.order_number}`,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Crear items de venta
      if (order.items && order.items.length > 0) {
        const saleItems = order.items.map(item => ({
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          tax_amount: item.tax_amount,
          discount_amount: item.discount_amount,
          notes: { 
            product_name: item.product_name,
            from_web_order: order.order_number 
          },
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;
      }

      // Vincular pedido con venta
      await supabase
        .from('web_orders')
        .update({ sale_id: sale.id })
        .eq('id', orderId);

      return { saleId: sale.id };
    } catch (error) {
      console.error('Error converting order to sale:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de pedidos
   */
  async getOrderStats(dateFrom?: string, dateTo?: string): Promise<{
    total_orders: number;
    pending_orders: number;
    completed_orders: number;
    cancelled_orders: number;
    total_revenue: number;
    avg_order_value: number;
    by_delivery_type: { type: string; count: number; revenue: number }[];
    by_source: { source: string; count: number }[];
  }> {
    try {
      let query = supabase
        .from('web_orders')
        .select('id, status, total, delivery_type, source')
        .eq('organization_id', this.organizationId);

      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);

      const { data: orders, error } = await query;

      if (error) throw error;

      const stats = {
        total_orders: orders?.length || 0,
        pending_orders: 0,
        completed_orders: 0,
        cancelled_orders: 0,
        total_revenue: 0,
        avg_order_value: 0,
        by_delivery_type: [] as { type: string; count: number; revenue: number }[],
        by_source: [] as { source: string; count: number }[],
      };

      const deliveryTypeMap = new Map<string, { count: number; revenue: number }>();
      const sourceMap = new Map<string, number>();

      orders?.forEach(order => {
        // Conteo por estado
        if (['pending', 'confirmed', 'preparing', 'ready', 'in_delivery'].includes(order.status)) {
          stats.pending_orders++;
        } else if (order.status === 'delivered') {
          stats.completed_orders++;
          stats.total_revenue += Number(order.total) || 0;
        } else if (['cancelled', 'rejected'].includes(order.status)) {
          stats.cancelled_orders++;
        }

        // Por tipo de entrega
        const dt = deliveryTypeMap.get(order.delivery_type) || { count: 0, revenue: 0 };
        dt.count++;
        if (order.status === 'delivered') dt.revenue += Number(order.total) || 0;
        deliveryTypeMap.set(order.delivery_type, dt);

        // Por origen
        sourceMap.set(order.source, (sourceMap.get(order.source) || 0) + 1);
      });

      stats.avg_order_value = stats.completed_orders > 0 
        ? stats.total_revenue / stats.completed_orders 
        : 0;

      stats.by_delivery_type = Array.from(deliveryTypeMap.entries()).map(([type, data]) => ({
        type,
        ...data,
      }));

      stats.by_source = Array.from(sourceMap.entries()).map(([source, count]) => ({
        source,
        count,
      }));

      return stats;
    } catch (error) {
      console.error('Error fetching order stats:', error);
      throw error;
    }
  }

  /**
   * Suscribirse a cambios en pedidos (tiempo real)
   */
  subscribeToOrders(callback: (payload: any) => void) {
    return supabase
      .channel('web_orders_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'web_orders',
          filter: `organization_id=eq.${this.organizationId}`,
        },
        callback
      )
      .subscribe();
  }

  /**
   * Cancelar suscripción
   */
  unsubscribeFromOrders() {
    supabase.removeChannel(supabase.channel('web_orders_changes'));
  }
}

export const webOrdersService = new WebOrdersService();
