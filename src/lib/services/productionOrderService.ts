import { supabase } from '@/lib/supabase/config';

export type ProductionOrderStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface ProductionOrder {
  id: number;
  organization_id: number;
  branch_id: number;
  recipe_id: number;
  product_id: number;
  qty_to_produce: number;
  status: ProductionOrderStatus;
  started_at: string | null;
  completed_at: string | null;
  produced_qty: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  recipe?: {
    id: number;
    name: string | null;
    yield_qty: number;
    yield_unit_code: string | null;
  };
  product?: {
    id: number;
    name: string;
    sku: string;
  };
  consumptions?: ProductionOrderConsumption[];
}

export interface ProductionOrderConsumption {
  id: number;
  production_order_id: number;
  ingredient_product_id: number;
  quantity_consumed: number;
  unit_code: string;
  stock_movement_id: number | null;
  created_at: string;
  ingredient_product?: {
    id: number;
    name: string;
    sku: string;
  };
}

export interface CreateProductionOrderData {
  organization_id: number;
  branch_id: number;
  recipe_id: number;
  product_id: number;
  qty_to_produce: number;
  notes?: string;
  created_by?: string;
}

class ProductionOrderService {
  async getOrders(
    organizationId: number,
    filters?: { status?: ProductionOrderStatus; branch_id?: number }
  ): Promise<ProductionOrder[]> {
    try {
      let query = supabase
        .from('production_orders')
        .select(`
          *,
          recipe:product_recipes (
            id, name, yield_qty, yield_unit_code
          ),
          product:products (
            id, name, sku
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.branch_id) {
        query = query.eq('branch_id', filters.branch_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as ProductionOrder[];
    } catch (error) {
      console.error('Error obteniendo órdenes de producción:', error);
      throw error;
    }
  }

  async getOrderById(orderId: number): Promise<ProductionOrder | null> {
    try {
      const { data: order, error } = await supabase
        .from('production_orders')
        .select(`
          *,
          recipe:product_recipes (
            id, name, yield_qty, yield_unit_code
          ),
          product:products (
            id, name, sku
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      if (!order) return null;

      const { data: consumptions, error: consError } = await supabase
        .from('production_order_consumptions')
        .select(`
          *,
          ingredient_product:products (
            id, name, sku
          )
        `)
        .eq('production_order_id', orderId);

      if (consError) throw consError;

      return { ...order, consumptions: consumptions || [] } as ProductionOrder;
    } catch (error) {
      console.error('Error obteniendo orden de producción:', error);
      throw error;
    }
  }

  async createOrder(data: CreateProductionOrderData): Promise<ProductionOrder> {
    try {
      const { data: order, error } = await supabase
        .from('production_orders')
        .insert({
          organization_id: data.organization_id,
          branch_id: data.branch_id,
          recipe_id: data.recipe_id,
          product_id: data.product_id,
          qty_to_produce: data.qty_to_produce,
          status: 'draft',
          produced_qty: 0,
          notes: data.notes,
          created_by: data.created_by,
        })
        .select()
        .single();

      if (error) throw error;
      return order as ProductionOrder;
    } catch (error) {
      console.error('Error creando orden de producción:', error);
      throw error;
    }
  }

  async updateStatus(
    orderId: number,
    status: ProductionOrderStatus,
    producedQty?: number
  ): Promise<void> {
    try {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'in_progress') {
        updates.started_at = new Date().toISOString();
      }

      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
        if (producedQty !== undefined) {
          updates.produced_qty = producedQty;
        }
      }

      const { error } = await supabase
        .from('production_orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando estado de orden:', error);
      throw error;
    }
  }

  async confirmOrder(orderId: number): Promise<void> {
    await this.updateStatus(orderId, 'confirmed');
  }

  async startOrder(orderId: number): Promise<void> {
    await this.updateStatus(orderId, 'in_progress');
  }

  async completeOrder(orderId: number, producedQty: number): Promise<void> {
    await this.updateStatus(orderId, 'completed', producedQty);
  }

  async cancelOrder(orderId: number): Promise<void> {
    await this.updateStatus(orderId, 'cancelled');
  }

  async deleteOrder(orderId: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('production_orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando orden de producción:', error);
      throw error;
    }
  }

  async getStats(organizationId: number) {
    try {
      const { data, error } = await supabase
        .from('production_orders')
        .select('status')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const orders = data || [];
      return {
        total: orders.length,
        draft: orders.filter((o) => o.status === 'draft').length,
        confirmed: orders.filter((o) => o.status === 'confirmed').length,
        in_progress: orders.filter((o) => o.status === 'in_progress').length,
        completed: orders.filter((o) => o.status === 'completed').length,
        cancelled: orders.filter((o) => o.status === 'cancelled').length,
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas de producción:', error);
      throw error;
    }
  }
}

export const productionOrderService = new ProductionOrderService();
