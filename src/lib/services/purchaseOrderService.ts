import { supabase } from '@/lib/supabase/config';

// Tipos para Órdenes de Compra
export interface PurchaseOrder {
  id: number;
  uuid: string;
  organization_id: number;
  branch_id: number;
  supplier_id: number;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  expected_date?: string;
  total: number;
  created_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  suppliers?: {
    id: number;
    name: string;
    uuid: string;
  };
  branches?: {
    id: number;
    name: string;
  };
  created_by_user?: {
    email: string;
  };
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  received_quantity: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  products?: {
    id: number;
    uuid: string;
    sku: string;
    name: string;
    unit_code?: string;
  };
}

export interface PurchaseOrderInput {
  branch_id: number;
  supplier_id: number;
  expected_date?: string;
  notes?: string;
  status?: 'draft' | 'sent';
}

export interface PurchaseOrderItemInput {
  product_id: number;
  quantity: number;
  unit_cost: number;
  notes?: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

// Estadísticas
export interface PurchaseOrderStats {
  total: number;
  draft: number;
  sent: number;
  partial: number;
  received: number;
  cancelled: number;
  totalAmount: number;
}

class PurchaseOrderService {
  /**
   * Obtener lista de órdenes de compra con filtros
   */
  async getPurchaseOrders(
    organizationId: number,
    filters?: {
      status?: string;
      supplierId?: number;
      branchId?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ data: PurchaseOrder[]; error: Error | null }> {
    try {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers:supplier_id (id, name, uuid),
          branches:branch_id (id, name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.supplierId) {
        query = query.eq('supplier_id', filters.supplierId);
      }
      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: data as PurchaseOrder[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo órdenes de compra:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener una orden de compra por UUID con sus items
   */
  async getPurchaseOrderByUuid(
    orderUuid: string,
    organizationId: number
  ): Promise<{ data: PurchaseOrderWithItems | null; error: Error | null }> {
    try {
      // Validar UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderUuid)) {
        return { data: null, error: new Error('UUID de orden inválido') };
      }

      // Obtener la orden
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers:supplier_id (id, name, uuid),
          branches:branch_id (id, name)
        `)
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (orderError) {
        if (orderError.code === 'PGRST116') {
          return { data: null, error: new Error('Orden de compra no encontrada') };
        }
        throw orderError;
      }

      // Obtener los items usando el ID numérico interno
      const { data: items, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          products:product_id (id, uuid, sku, name, unit_code)
        `)
        .eq('purchase_order_id', order.id)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        data: {
          ...(order as PurchaseOrder),
          items: items as PurchaseOrderItem[]
        },
        error: null
      };
    } catch (error: any) {
      console.error('Error obteniendo orden de compra:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Crear nueva orden de compra
   */
  async createPurchaseOrder(
    organizationId: number,
    input: PurchaseOrderInput,
    items: PurchaseOrderItemInput[]
  ): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
    try {
      // Obtener el usuario actual
      const { data: { user } } = await supabase.auth.getUser();

      // Crear la orden
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          organization_id: organizationId,
          branch_id: input.branch_id,
          supplier_id: input.supplier_id,
          status: input.status || 'draft',
          expected_date: input.expected_date || null,
          notes: input.notes || null,
          created_by: user?.id || null,
          total: 0
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insertar items si existen
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          purchase_order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          notes: item.notes || null
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // Actualizar total de la orden
        const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
        await supabase
          .from('purchase_orders')
          .update({ total })
          .eq('id', order.id);
      }

      return { data: order as PurchaseOrder, error: null };
    } catch (error: any) {
      console.error('Error creando orden de compra:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Actualizar orden de compra por UUID
   */
  async updatePurchaseOrder(
    orderUuid: string,
    organizationId: number,
    input: Partial<PurchaseOrderInput>,
    items?: PurchaseOrderItemInput[]
  ): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
    try {
      // Actualizar la orden
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .update({
          branch_id: input.branch_id,
          supplier_id: input.supplier_id,
          expected_date: input.expected_date || null,
          notes: input.notes || null,
          status: input.status,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (orderError) throw orderError;

      // Si se proporcionan items, actualizar
      if (items) {
        // Eliminar items existentes
        await supabase
          .from('purchase_order_items')
          .delete()
          .eq('purchase_order_id', order.id);

        // Insertar nuevos items
        if (items.length > 0) {
          const itemsToInsert = items.map((item: PurchaseOrderItemInput) => ({
            purchase_order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            notes: item.notes || null
          }));

          const { error: itemsError } = await supabase
            .from('purchase_order_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;

          // Actualizar total
          const total = items.reduce((sum: number, item: PurchaseOrderItemInput) => sum + (item.quantity * item.unit_cost), 0);
          await supabase
            .from('purchase_orders')
            .update({ total })
            .eq('id', order.id);
        }
      }

      return { data: order as PurchaseOrder, error: null };
    } catch (error: any) {
      console.error('Error actualizando orden de compra:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Cambiar estado de orden de compra por UUID
   */
  async updateStatus(
    orderUuid: string,
    organizationId: number,
    newStatus: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error actualizando estado:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Eliminar orden de compra por UUID (solo draft)
   */
  async deletePurchaseOrder(
    orderUuid: string,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      // Verificar que esté en draft
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (order?.status !== 'draft') {
        return { success: false, error: new Error('Solo se pueden eliminar órdenes en borrador') };
      }

      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error eliminando orden:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Duplicar orden de compra por UUID
   */
  async duplicatePurchaseOrder(
    orderUuid: string,
    organizationId: number
  ): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
    try {
      // Obtener orden original con items
      const { data: original, error: getError } = await this.getPurchaseOrderByUuid(orderUuid, organizationId);

      if (getError || !original) {
        throw getError || new Error('Orden no encontrada');
      }

      // Crear nueva orden
      const { data: newOrder, error: createError } = await this.createPurchaseOrder(
        organizationId,
        {
          branch_id: original.branch_id,
          supplier_id: original.supplier_id,
          expected_date: original.expected_date,
          notes: original.notes ? `(Copia) ${original.notes}` : '(Copia)',
          status: 'draft'
        },
        original.items.map((item: PurchaseOrderItem) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          notes: item.notes
        }))
      );

      if (createError) throw createError;

      return { data: newOrder, error: null };
    } catch (error: any) {
      console.error('Error duplicando orden:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Recibir items (parcial o total) por UUID
   */
  async receiveItems(
    orderUuid: string,
    organizationId: number,
    itemsReceived: { itemId: number; quantity: number }[]
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      // Obtener el ID numérico de la orden
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (!order) {
        return { success: false, error: new Error('Orden no encontrada') };
      }

      const orderId = order.id;

      // Actualizar cantidad recibida de cada item
      for (const item of itemsReceived) {
        const { error } = await supabase
          .from('purchase_order_items')
          .update({
            received_quantity: item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.itemId)
          .eq('purchase_order_id', orderId);

        if (error) throw error;
      }

      // Verificar si es recepción total o parcial
      const { data: allItems } = await supabase
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', orderId);

      if (allItems) {
        const isComplete = allItems.every((item: { quantity: number; received_quantity: number }) => item.received_quantity >= item.quantity);
        const isPartial = allItems.some((item: { quantity: number; received_quantity: number }) => item.received_quantity > 0);

        const newStatus = isComplete ? 'received' : (isPartial ? 'partial' : 'sent');

        await this.updateStatus(orderUuid, organizationId, newStatus);
      }

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error recibiendo items:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Obtener estadísticas
   */
  async getStats(organizationId: number): Promise<PurchaseOrderStats> {
    try {
      const { data } = await supabase
        .from('purchase_orders')
        .select('status, total')
        .eq('organization_id', organizationId);

      if (!data) {
        return { total: 0, draft: 0, sent: 0, partial: 0, received: 0, cancelled: 0, totalAmount: 0 };
      }

      return {
        total: data.length,
        draft: data.filter(o => o.status === 'draft').length,
        sent: data.filter(o => o.status === 'sent').length,
        partial: data.filter(o => o.status === 'partial').length,
        received: data.filter(o => o.status === 'received').length,
        cancelled: data.filter(o => o.status === 'cancelled').length,
        totalAmount: data.reduce((sum, o) => sum + (o.total || 0), 0)
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { total: 0, draft: 0, sent: 0, partial: 0, received: 0, cancelled: 0, totalAmount: 0 };
    }
  }

  /**
   * Obtener proveedores para selector
   */
  async getSuppliers(organizationId: number): Promise<{ id: number; uuid: string; name: string }[]> {
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('id, uuid, name')
        .eq('organization_id', organizationId)
        .order('name');

      return data || [];
    } catch (error) {
      console.error('Error obteniendo proveedores:', error);
      return [];
    }
  }

  /**
   * Obtener sucursales para selector
   */
  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    try {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      return data || [];
    } catch (error) {
      console.error('Error obteniendo sucursales:', error);
      return [];
    }
  }

  /**
   * Obtener productos para selector
   */
  async getProducts(organizationId: number): Promise<{ id: number; uuid: string; sku: string; name: string }[]> {
    try {
      const { data } = await supabase
        .from('products')
        .select('id, uuid, sku, name')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('name');

      return data || [];
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }
}

export const purchaseOrderService = new PurchaseOrderService();
