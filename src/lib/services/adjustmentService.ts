import { supabase } from '@/lib/supabase/config';

// Tipos para Ajustes de Inventario
export interface InventoryAdjustment {
  id: number;
  organization_id: number;
  branch_id: number;
  type: string;
  reason: string;
  status: 'draft' | 'applied' | 'cancelled';
  created_by?: string;
  created_at: string;
  updated_at: string;
  notes?: string;
  // Relaciones
  branches?: {
    id: number;
    name: string;
  };
  profiles?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  adjustment_items?: AdjustmentItem[];
}

export interface AdjustmentItem {
  id: number;
  inventory_adjustment_id: number;
  product_id: number;
  quantity: number;
  lot_id?: number;
  unit_cost?: number;
  created_at: string;
  updated_at: string;
  // Relaciones
  products?: {
    id: number;
    uuid?: string;
    name: string;
    sku: string;
  };
  lots?: {
    id: number;
    lot_number: string;
  };
  // Campos calculados
  system_qty?: number;
  difference?: number;
}

// Input para crear ajuste
export interface CreateAdjustmentInput {
  organization_id: number;
  branch_id: number;
  type: string;
  reason: string;
  notes?: string;
  items: {
    product_id: number;
    quantity: number;
    lot_id?: number;
    unit_cost?: number;
  }[];
}

// Input para actualizar ajuste
export interface UpdateAdjustmentInput {
  type?: string;
  reason?: string;
  notes?: string;
  items?: {
    product_id: number;
    quantity: number;
    lot_id?: number;
    unit_cost?: number;
  }[];
}

// Estadísticas de ajustes
export interface AdjustmentStats {
  total: number;
  draft: number;
  applied: number;
  cancelled: number;
}

// Tipos de ajuste
export const ADJUSTMENT_TYPES = [
  { value: 'count', label: 'Conteo Físico' },
  { value: 'damage', label: 'Daño/Merma' },
  { value: 'loss', label: 'Pérdida' },
  { value: 'correction', label: 'Corrección' },
  { value: 'initial', label: 'Inventario Inicial' },
  { value: 'write_off', label: 'Baja de Inventario' },
  { value: 'found', label: 'Producto Encontrado' },
  { value: 'other', label: 'Otro' }
];

// Razones de ajuste
export const ADJUSTMENT_REASONS = [
  { value: 'physical_count', label: 'Conteo físico programado' },
  { value: 'discrepancy', label: 'Discrepancia detectada' },
  { value: 'damaged', label: 'Producto dañado' },
  { value: 'expired', label: 'Producto vencido' },
  { value: 'theft', label: 'Robo/Hurto' },
  { value: 'production_waste', label: 'Merma de producción' },
  { value: 'system_error', label: 'Error del sistema' },
  { value: 'initial_setup', label: 'Configuración inicial' },
  { value: 'audit', label: 'Auditoría' },
  { value: 'other', label: 'Otro' }
];

class AdjustmentService {
  /**
   * Obtener lista de ajustes con filtros
   */
  async getAdjustments(
    organizationId: number,
    filters?: {
      branchId?: number;
      type?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: InventoryAdjustment[]; count: number; error: Error | null }> {
    try {
      let query = supabase
        .from('inventory_adjustments')
        .select(`
          *,
          branches (
            id,
            name
          )
        `, { count: 'exact' })
        .eq('organization_id', organizationId);

      // Aplicar filtros
      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      // Paginación
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return { data: data as InventoryAdjustment[], count: count || 0, error: null };
    } catch (error) {
      console.error('Error obteniendo ajustes:', error);
      return { data: [], count: 0, error: error as Error };
    }
  }

  /**
   * Obtener un ajuste por ID con sus items
   */
  async getAdjustmentById(
    adjustmentId: number,
    organizationId: number
  ): Promise<{ data: InventoryAdjustment | null; error: Error | null }> {
    try {
      const { data: adjustment, error: adjustmentError } = await supabase
        .from('inventory_adjustments')
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .eq('id', adjustmentId)
        .eq('organization_id', organizationId)
        .single();

      if (adjustmentError) throw adjustmentError;

      // Obtener items del ajuste
      const { data: items, error: itemsError } = await supabase
        .from('adjustment_items')
        .select(`
          *,
          products (
            id,
            uuid,
            name,
            sku
          ),
          lots (
            id,
            lot_number
          )
        `)
        .eq('inventory_adjustment_id', adjustmentId);

      if (itemsError) throw itemsError;

      // Obtener stock actual para calcular diferencias
      const productIds = items?.map(i => i.product_id) || [];
      
      if (productIds.length > 0) {
        const { data: stockLevels } = await supabase
          .from('stock_levels')
          .select('product_id, qty_on_hand')
          .eq('branch_id', adjustment.branch_id)
          .in('product_id', productIds);

        // Agregar cantidad del sistema y diferencia a cada item
        const itemsWithDiff = items?.map(item => {
          const stock = stockLevels?.find(s => s.product_id === item.product_id);
          const systemQty = stock?.qty_on_hand || 0;
          return {
            ...item,
            system_qty: systemQty,
            difference: item.quantity - systemQty
          };
        });

        adjustment.adjustment_items = itemsWithDiff;
      } else {
        adjustment.adjustment_items = items || [];
      }

      return { data: adjustment as InventoryAdjustment, error: null };
    } catch (error) {
      console.error('Error obteniendo ajuste:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Crear nuevo ajuste
   */
  async createAdjustment(
    input: CreateAdjustmentInput,
    userId: string
  ): Promise<{ data: InventoryAdjustment | null; error: Error | null }> {
    try {
      // Crear el ajuste
      const { data: adjustment, error: adjustmentError } = await supabase
        .from('inventory_adjustments')
        .insert({
          organization_id: input.organization_id,
          branch_id: input.branch_id,
          type: input.type,
          reason: input.reason,
          notes: input.notes,
          status: 'draft',
          created_by: userId
        })
        .select()
        .single();

      if (adjustmentError) throw adjustmentError;

      // Crear los items
      if (input.items && input.items.length > 0) {
        const itemsToInsert = input.items.map(item => ({
          inventory_adjustment_id: adjustment.id,
          product_id: item.product_id,
          quantity: item.quantity,
          lot_id: item.lot_id || null,
          unit_cost: item.unit_cost || null
        }));

        const { error: itemsError } = await supabase
          .from('adjustment_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      return { data: adjustment as InventoryAdjustment, error: null };
    } catch (error) {
      console.error('Error creando ajuste:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Actualizar ajuste (solo si está en draft)
   */
  async updateAdjustment(
    adjustmentId: number,
    organizationId: number,
    input: UpdateAdjustmentInput
  ): Promise<{ data: InventoryAdjustment | null; error: Error | null }> {
    try {
      // Verificar que el ajuste esté en draft
      const { data: existing, error: checkError } = await supabase
        .from('inventory_adjustments')
        .select('status')
        .eq('id', adjustmentId)
        .eq('organization_id', organizationId)
        .single();

      if (checkError) throw checkError;

      if (existing.status !== 'draft') {
        throw new Error('Solo se pueden editar ajustes en estado borrador');
      }

      // Actualizar el ajuste
      const updateData: any = { updated_at: new Date().toISOString() };
      if (input.type) updateData.type = input.type;
      if (input.reason) updateData.reason = input.reason;
      if (input.notes !== undefined) updateData.notes = input.notes;

      const { data: adjustment, error: updateError } = await supabase
        .from('inventory_adjustments')
        .update(updateData)
        .eq('id', adjustmentId)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Actualizar items si se proporcionaron
      if (input.items) {
        // Eliminar items existentes
        await supabase
          .from('adjustment_items')
          .delete()
          .eq('inventory_adjustment_id', adjustmentId);

        // Insertar nuevos items
        if (input.items.length > 0) {
          const itemsToInsert = input.items.map(item => ({
            inventory_adjustment_id: adjustmentId,
            product_id: item.product_id,
            quantity: item.quantity,
            lot_id: item.lot_id || null,
            unit_cost: item.unit_cost || null
          }));

          await supabase
            .from('adjustment_items')
            .insert(itemsToInsert);
        }
      }

      return { data: adjustment as InventoryAdjustment, error: null };
    } catch (error) {
      console.error('Error actualizando ajuste:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Aplicar ajuste (genera movimientos de stock)
   */
  async applyAdjustment(
    adjustmentId: number,
    organizationId: number,
    userId: string
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      // Obtener ajuste con items
      const { data: adjustment, error: getError } = await this.getAdjustmentById(
        adjustmentId,
        organizationId
      );

      if (getError) throw getError;
      if (!adjustment) throw new Error('Ajuste no encontrado');

      if (adjustment.status !== 'draft') {
        throw new Error('Solo se pueden aplicar ajustes en estado borrador');
      }

      const items = adjustment.adjustment_items || [];

      // Crear movimientos de stock para cada item
      for (const item of items) {
        const difference = item.difference || 0;
        
        if (difference === 0) continue;

        // Crear movimiento de stock
        await supabase
          .from('stock_movements')
          .insert({
            organization_id: organizationId,
            branch_id: adjustment.branch_id,
            product_id: item.product_id,
            lot_id: item.lot_id || null,
            direction: difference > 0 ? 'in' : 'out',
            qty: Math.abs(difference),
            unit_cost: item.unit_cost || 0,
            source: 'adjustment',
            source_id: adjustmentId.toString(),
            note: `Ajuste: ${adjustment.type} - ${adjustment.reason}`,
            updated_by: userId
          });

        // Actualizar stock_levels
        const { data: existingStock } = await supabase
          .from('stock_levels')
          .select('id, qty_on_hand')
          .eq('branch_id', adjustment.branch_id)
          .eq('product_id', item.product_id)
          .maybeSingle();

        if (existingStock) {
          // Actualizar registro existente
          await supabase
            .from('stock_levels')
            .update({
              qty_on_hand: item.quantity,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingStock.id);
        } else {
          // Crear nuevo registro
          await supabase
            .from('stock_levels')
            .insert({
              product_id: item.product_id,
              branch_id: adjustment.branch_id,
              qty_on_hand: item.quantity,
              qty_reserved: 0,
              avg_cost: item.unit_cost || 0,
              min_level: 0
            });
        }
      }

      // Actualizar estado del ajuste a aplicado
      const { error: updateError } = await supabase
        .from('inventory_adjustments')
        .update({
          status: 'applied',
          updated_at: new Date().toISOString()
        })
        .eq('id', adjustmentId);

      if (updateError) throw updateError;

      return { success: true, error: null };
    } catch (error) {
      console.error('Error aplicando ajuste:', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Cancelar ajuste
   */
  async cancelAdjustment(
    adjustmentId: number,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      // Verificar que el ajuste esté en draft
      const { data: existing, error: checkError } = await supabase
        .from('inventory_adjustments')
        .select('status')
        .eq('id', adjustmentId)
        .eq('organization_id', organizationId)
        .single();

      if (checkError) throw checkError;

      if (existing.status !== 'draft') {
        throw new Error('Solo se pueden cancelar ajustes en estado borrador');
      }

      const { error: updateError } = await supabase
        .from('inventory_adjustments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', adjustmentId);

      if (updateError) throw updateError;

      return { success: true, error: null };
    } catch (error) {
      console.error('Error cancelando ajuste:', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Eliminar ajuste (solo draft)
   */
  async deleteAdjustment(
    adjustmentId: number,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      // Verificar que el ajuste esté en draft
      const { data: existing, error: checkError } = await supabase
        .from('inventory_adjustments')
        .select('status')
        .eq('id', adjustmentId)
        .eq('organization_id', organizationId)
        .single();

      if (checkError) throw checkError;

      if (existing.status !== 'draft') {
        throw new Error('Solo se pueden eliminar ajustes en estado borrador');
      }

      // Eliminar items primero
      await supabase
        .from('adjustment_items')
        .delete()
        .eq('inventory_adjustment_id', adjustmentId);

      // Eliminar ajuste
      const { error: deleteError } = await supabase
        .from('inventory_adjustments')
        .delete()
        .eq('id', adjustmentId);

      if (deleteError) throw deleteError;

      return { success: true, error: null };
    } catch (error) {
      console.error('Error eliminando ajuste:', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Obtener estadísticas de ajustes
   */
  async getAdjustmentStats(organizationId: number, branchId?: number): Promise<AdjustmentStats> {
    try {
      let query = supabase
        .from('inventory_adjustments')
        .select('status')
        .eq('organization_id', organizationId);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats: AdjustmentStats = {
        total: data?.length || 0,
        draft: 0,
        applied: 0,
        cancelled: 0
      };

      data?.forEach((item: any) => {
        if (item.status === 'draft') stats.draft++;
        else if (item.status === 'applied') stats.applied++;
        else if (item.status === 'cancelled') stats.cancelled++;
      });

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { total: 0, draft: 0, applied: 0, cancelled: 0 };
    }
  }

  /**
   * Obtener productos para selección en ajuste
   */
  async getProductsForAdjustment(
    organizationId: number,
    branchId: number,
    searchTerm?: string
  ): Promise<{
    id: number;
    uuid?: string;
    name: string;
    sku: string;
    current_qty: number;
    avg_cost: number;
  }[]> {
    try {
      let query = supabase
        .from('products')
        .select(`
          id,
          uuid,
          name,
          sku,
          stock_levels!inner (
            qty_on_hand,
            avg_cost,
            branch_id
          )
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .eq('stock_levels.branch_id', branchId);

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      return (data || []).map((p: any) => ({
        id: p.id,
        uuid: p.uuid,
        name: p.name,
        sku: p.sku,
        current_qty: p.stock_levels?.[0]?.qty_on_hand || 0,
        avg_cost: p.stock_levels?.[0]?.avg_cost || 0
      }));
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }

  /**
   * Obtener movimientos generados por un ajuste
   */
  async getMovementsByAdjustment(adjustmentId: number): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          *,
          products (
            id,
            name,
            sku
          ),
          branches (
            id,
            name
          )
        `)
        .eq('source', 'adjustment')
        .eq('source_id', adjustmentId.toString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error obteniendo movimientos:', error);
      return [];
    }
  }

  /**
   * Obtener sucursales
   */
  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error obteniendo sucursales:', error);
      return [];
    }
  }
}

export const adjustmentService = new AdjustmentService();
export default adjustmentService;
