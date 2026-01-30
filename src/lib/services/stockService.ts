import { supabase } from '@/lib/supabase/config';

// Tipos para Stock Levels
export interface StockLevel {
  id: number;
  product_id: number;
  branch_id: number;
  lot_id?: number;
  qty_on_hand: number;
  qty_reserved: number;
  avg_cost: number;
  min_level: number;
  created_at: string;
  updated_at: string;
  // Relaciones
  products?: {
    id: number;
    uuid?: string;
    name: string;
    sku: string;
    barcode?: string;
    category_id?: number;
    categories?: {
      id: number;
      name: string;
    };
  };
  branches?: {
    id: number;
    name: string;
    branch_code?: string;
  };
  lots?: {
    id: number;
    lot_number: string;
    expiry_date?: string;
  };
}

// Tipos para Stock Movements
export interface StockMovement {
  id: number;
  organization_id: number;
  branch_id: number;
  product_id: number;
  lot_id?: number;
  direction: 'in' | 'out';
  qty: number;
  unit_cost?: number;
  source: string;
  source_id?: string;
  note?: string;
  created_at: string;
  updated_by?: string;
  // Relaciones
  products?: {
    id: number;
    uuid?: string;
    name: string;
    sku: string;
  };
  branches?: {
    id: number;
    name: string;
  };
  lots?: {
    id: number;
    lot_number: string;
  };
  profiles?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

// Filtros para Stock Levels
export interface StockFilters {
  branchId?: number;
  categoryId?: number;
  belowMinimum?: boolean;
  outOfStock?: boolean;
  searchTerm?: string;
  tagIds?: number[];
}

// Filtros para Movimientos
export interface MovementFilters {
  branchId?: number;
  productId?: number;
  source?: string;
  direction?: 'in' | 'out';
  dateFrom?: string;
  dateTo?: string;
  lotId?: number;
  searchTerm?: string;
}

// Estadísticas de Stock
export interface StockStats {
  totalProducts: number;
  totalValue: number;
  belowMinimum: number;
  outOfStock: number;
  totalBranches: number;
}

// Estadísticas de Movimientos
export interface MovementStats {
  totalMovements: number;
  totalIn: number;
  totalOut: number;
  valueIn: number;
  valueOut: number;
}

class StockService {
  /**
   * Obtener niveles de stock con filtros
   */
  async getStockLevels(
    organizationId: number,
    filters?: StockFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: StockLevel[]; count: number; error: Error | null }> {
    try {
      let query = supabase
        .from('stock_levels')
        .select(`
          *,
          products!inner (
            id,
            uuid,
            name,
            sku,
            barcode,
            category_id,
            organization_id,
            categories (
              id,
              name
            )
          ),
          branches (
            id,
            name,
            branch_code
          ),
          lots (
            id,
            lot_number,
            expiry_date
          )
        `, { count: 'exact' })
        .eq('products.organization_id', organizationId);

      // Aplicar filtros
      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters?.categoryId) {
        query = query.eq('products.category_id', filters.categoryId);
      }

      if (filters?.belowMinimum) {
        query = query.lt('qty_on_hand', supabase.rpc('get_min_level'));
      }

      if (filters?.outOfStock) {
        query = query.lte('qty_on_hand', 0);
      }

      if (filters?.searchTerm) {
        query = query.or(`products.name.ilike.%${filters.searchTerm}%,products.sku.ilike.%${filters.searchTerm}%,products.barcode.ilike.%${filters.searchTerm}%`);
      }

      // Paginación
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('products(name)', { ascending: true })
        .range(from, to);

      if (error) throw error;

      return { data: data as StockLevel[], count: count || 0, error: null };
    } catch (error) {
      console.error('Error obteniendo niveles de stock:', error);
      return { data: [], count: 0, error: error as Error };
    }
  }

  /**
   * Obtener niveles de stock simplificado (sin paginación compleja)
   */
  async getStockLevelsSimple(
    organizationId: number,
    branchId?: number
  ): Promise<{ data: StockLevel[]; error: Error | null }> {
    try {
      let query = supabase
        .from('stock_levels')
        .select(`
          *,
          products!inner (
            id,
            uuid,
            name,
            sku,
            barcode,
            category_id,
            organization_id,
            status,
            categories (
              id,
              name
            )
          ),
          branches (
            id,
            name,
            branch_code
          )
        `)
        .eq('products.organization_id', organizationId)
        .eq('products.status', 'active');

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      return { data: data as StockLevel[], error: null };
    } catch (error) {
      console.error('Error obteniendo niveles de stock:', error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener estadísticas de stock
   */
  async getStockStats(organizationId: number, branchId?: number): Promise<StockStats> {
    try {
      let query = supabase
        .from('stock_levels')
        .select(`
          id,
          qty_on_hand,
          qty_reserved,
          avg_cost,
          min_level,
          branch_id,
          products!inner (
            organization_id
          )
        `)
        .eq('products.organization_id', organizationId);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats: StockStats = {
        totalProducts: data?.length || 0,
        totalValue: 0,
        belowMinimum: 0,
        outOfStock: 0,
        totalBranches: 0
      };

      const uniqueBranches = new Set<number>();

      data?.forEach((item: any) => {
        stats.totalValue += (item.qty_on_hand || 0) * (item.avg_cost || 0);
        if (item.qty_on_hand <= 0) {
          stats.outOfStock++;
        } else if (item.qty_on_hand < (item.min_level || 0)) {
          stats.belowMinimum++;
        }
        uniqueBranches.add(item.branch_id);
      });

      stats.totalBranches = uniqueBranches.size;

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas de stock:', error);
      return {
        totalProducts: 0,
        totalValue: 0,
        belowMinimum: 0,
        outOfStock: 0,
        totalBranches: 0
      };
    }
  }

  /**
   * Obtener movimientos de stock con filtros
   */
  async getStockMovements(
    organizationId: number,
    filters?: MovementFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: StockMovement[]; count: number; error: Error | null }> {
    try {
      let query = supabase
        .from('stock_movements')
        .select(`
          *,
          products (
            id,
            uuid,
            name,
            sku
          ),
          branches (
            id,
            name
          ),
          lots (
            id,
            lot_number
          )
        `, { count: 'exact' })
        .eq('organization_id', organizationId);

      // Aplicar filtros
      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }

      if (filters?.source) {
        query = query.eq('source', filters.source);
      }

      if (filters?.direction) {
        query = query.eq('direction', filters.direction);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      if (filters?.lotId) {
        query = query.eq('lot_id', filters.lotId);
      }

      if (filters?.searchTerm) {
        // Búsqueda por nota o source_id
        query = query.or(`note.ilike.%${filters.searchTerm}%,source_id.ilike.%${filters.searchTerm}%`);
      }

      // Paginación
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return { data: data as StockMovement[], count: count || 0, error: null };
    } catch (error) {
      console.error('Error obteniendo movimientos de stock:', error);
      return { data: [], count: 0, error: error as Error };
    }
  }

  /**
   * Obtener estadísticas de movimientos
   */
  async getMovementStats(
    organizationId: number,
    filters?: MovementFilters
  ): Promise<MovementStats> {
    try {
      let query = supabase
        .from('stock_movements')
        .select('id, direction, qty, unit_cost')
        .eq('organization_id', organizationId);

      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats: MovementStats = {
        totalMovements: data?.length || 0,
        totalIn: 0,
        totalOut: 0,
        valueIn: 0,
        valueOut: 0
      };

      data?.forEach((item: any) => {
        const value = (item.qty || 0) * (item.unit_cost || 0);
        if (item.direction === 'in') {
          stats.totalIn += item.qty || 0;
          stats.valueIn += value;
        } else {
          stats.totalOut += item.qty || 0;
          stats.valueOut += value;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas de movimientos:', error);
      return {
        totalMovements: 0,
        totalIn: 0,
        totalOut: 0,
        valueIn: 0,
        valueOut: 0
      };
    }
  }

  /**
   * Obtener sucursales de la organización
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

  /**
   * Obtener categorías de la organización
   */
  async getCategories(organizationId: number): Promise<{ id: number; name: string }[]> {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error obteniendo categorías:', error);
      return [];
    }
  }

  /**
   * Obtener tipos de origen de movimientos
   */
  getSourceTypes(): { value: string; label: string }[] {
    return [
      { value: 'sale', label: 'Venta' },
      { value: 'purchase', label: 'Compra' },
      { value: 'transfer', label: 'Transferencia' },
      { value: 'adjustment', label: 'Ajuste' },
      { value: 'return', label: 'Devolución' },
      { value: 'initial', label: 'Inventario Inicial' },
      { value: 'production', label: 'Producción' },
      { value: 'waste', label: 'Merma' }
    ];
  }

  /**
   * Exportar stock a CSV
   */
  async exportStockToCSV(organizationId: number, branchId?: number): Promise<string> {
    const { data } = await this.getStockLevelsSimple(organizationId, branchId);
    
    if (!data || data.length === 0) return '';

    const headers = ['Producto', 'SKU', 'Sucursal', 'Disponible', 'Reservado', 'Mínimo', 'Costo Promedio', 'Valor Total'];
    const rows = data.map(item => [
      item.products?.name || '',
      item.products?.sku || '',
      item.branches?.name || '',
      item.qty_on_hand?.toString() || '0',
      item.qty_reserved?.toString() || '0',
      item.min_level?.toString() || '0',
      item.avg_cost?.toString() || '0',
      ((item.qty_on_hand || 0) * (item.avg_cost || 0)).toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    return csvContent;
  }

  /**
   * Exportar movimientos a CSV
   */
  async exportMovementsToCSV(
    organizationId: number,
    filters?: MovementFilters
  ): Promise<string> {
    const { data } = await this.getStockMovements(organizationId, filters, 1, 10000);
    
    if (!data || data.length === 0) return '';

    const headers = ['Fecha', 'Producto', 'Sucursal', 'Dirección', 'Cantidad', 'Costo Unitario', 'Origen', 'Documento', 'Nota'];
    const rows = data.map(item => [
      new Date(item.created_at).toLocaleString('es-CO'),
      item.products?.name || '',
      item.branches?.name || '',
      item.direction === 'in' ? 'Entrada' : 'Salida',
      item.qty?.toString() || '0',
      item.unit_cost?.toString() || '0',
      item.source || '',
      item.source_id || '',
      item.note || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    return csvContent;
  }
}

export const stockService = new StockService();
export default stockService;
