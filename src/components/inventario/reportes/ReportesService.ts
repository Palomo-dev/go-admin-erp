import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { StockReport, KardexEntry, RotationReport, SupplierPurchaseReport, ReportFilter } from './types';

export class ReportesService {
  static async obtenerReporteStock(filters?: ReportFilter): Promise<StockReport[]> {
    try {
      const organizationId = getOrganizationId();
      const branchId = filters?.branchId || getCurrentBranchId();

      let query = supabase
        .from('stock_levels')
        .select(`
          id,
          qty_on_hand,
          min_level,
          avg_cost,
          products!inner (
            id,
            name,
            sku,
            organization_id,
            categories (
              name
            )
          ),
          branches (
            id,
            name
          )
        `)
        .eq('products.organization_id', organizationId);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      if (filters?.categoryId) {
        query = query.eq('products.category_id', filters.categoryId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Error obteniendo reporte stock:', error.message, error.code);
        throw new Error(`Error obteniendo reporte stock: ${error.message}`);
      }

      return (data || []).map((item: any) => {
        const unitCost = item.avg_cost || 0;
        const quantity = item.qty_on_hand || 0;
        const minStock = item.min_level || 0;

        let status: 'normal' | 'low' | 'out' | 'excess' = 'normal';
        if (quantity === 0) status = 'out';
        else if (quantity < minStock) status = 'low';

        return {
          product_id: item.products?.id,
          product_name: item.products?.name || '',
          sku: item.products?.sku || '',
          category_name: item.products?.categories?.name || 'Sin categoría',
          branch_name: item.branches?.name || '',
          quantity,
          min_stock: minStock,
          max_stock: 0,
          unit_cost: unitCost,
          total_value: quantity * unitCost,
          status,
        };
      });
    } catch (err) {
      console.error('❌ ReportesService.obtenerReporteStock:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerKardex(productId: number, filters?: ReportFilter): Promise<KardexEntry[]> {
    try {
      const branchId = filters?.branchId || getCurrentBranchId();

      let query = supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: true });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Error obteniendo kardex:', error.message, error.code);
        throw new Error(`Error obteniendo kardex: ${error.message}`);
      }

      let balance = 0;
      return (data || []).map((mov: any) => {
        const isEntry = mov.direction === 'in';
        const quantityIn = isEntry ? Math.abs(mov.qty || 0) : 0;
        const quantityOut = !isEntry ? Math.abs(mov.qty || 0) : 0;
        balance += quantityIn - quantityOut;

        return {
          id: mov.id,
          date: mov.created_at,
          movement_type: mov.source || mov.direction,
          document_reference: mov.source_id || '-',
          quantity_in: quantityIn,
          quantity_out: quantityOut,
          balance,
          unit_cost: mov.unit_cost || 0,
          total_cost: (mov.unit_cost || 0) * Math.abs(mov.qty || 0),
          notes: mov.note || '',
        };
      });
    } catch (err) {
      console.error('❌ ReportesService.obtenerKardex:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerReporteRotacion(filters?: ReportFilter): Promise<RotationReport[]> {
    try {
      const organizationId = getOrganizationId();
      const branchId = filters?.branchId || getCurrentBranchId();

      // Obtener productos
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select(`
          id,
          name,
          sku,
          categories (
            name
          )
        `)
        .eq('organization_id', organizationId);

      if (prodError) {
        console.error('❌ Error obteniendo productos para rotación:', prodError.message);
        throw new Error(`Error obteniendo productos: ${prodError.message}`);
      }

      const rotationData = await Promise.all(
        (products || []).map(async (product: any) => {
          // Movimientos de salida (ventas)
          let salesQuery = supabase
            .from('stock_movements')
            .select('qty')
            .eq('product_id', product.id)
            .eq('direction', 'out');

          if (branchId) salesQuery = salesQuery.eq('branch_id', branchId);
          if (filters?.dateFrom) salesQuery = salesQuery.gte('created_at', filters.dateFrom);
          if (filters?.dateTo) salesQuery = salesQuery.lte('created_at', filters.dateTo);

          const { data: salesData } = await salesQuery;

          // Movimientos de entrada (compras)
          let purchaseQuery = supabase
            .from('stock_movements')
            .select('qty')
            .eq('product_id', product.id)
            .eq('direction', 'in');

          if (branchId) purchaseQuery = purchaseQuery.eq('branch_id', branchId);
          if (filters?.dateFrom) purchaseQuery = purchaseQuery.gte('created_at', filters.dateFrom);
          if (filters?.dateTo) purchaseQuery = purchaseQuery.lte('created_at', filters.dateTo);

          const { data: purchaseData } = await purchaseQuery;

          const totalSold = (salesData || []).reduce((sum: number, m: any) => sum + Math.abs(m.qty || 0), 0);
          const totalPurchased = (purchaseData || []).reduce((sum: number, m: any) => sum + Math.abs(m.qty || 0), 0);

          // Calcular índice de rotación (ventas / promedio de inventario)
          const avgInventory = totalPurchased > 0 ? totalPurchased / 2 : 1;
          const rotationIndex = totalSold / avgInventory;

          return {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            category_name: product.categories?.name || 'Sin categoría',
            total_sold: totalSold,
            total_purchased: totalPurchased,
            rotation_index: Math.round(rotationIndex * 100) / 100,
            average_days_in_stock: rotationIndex > 0 ? Math.round(365 / rotationIndex) : 0,
          };
        })
      );

      return rotationData.sort((a, b) => b.rotation_index - a.rotation_index);
    } catch (err) {
      console.error('❌ ReportesService.obtenerReporteRotacion:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerReporteComprasProveedor(filters?: ReportFilter): Promise<SupplierPurchaseReport[]> {
    try {
      const organizationId = getOrganizationId();

      const { data: suppliers, error: suppError } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organizationId);

      if (suppError) {
        console.error('❌ Error obteniendo proveedores:', suppError.message);
        throw new Error(`Error obteniendo proveedores: ${suppError.message}`);
      }

      const supplierReports = await Promise.all(
        (suppliers || []).map(async (supplier: any) => {
          let query = supabase
            .from('purchase_orders')
            .select('id, total, created_at')
            .eq('supplier_id', supplier.id);

          if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
          if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);

          const { data: orders } = await query;

          const totalOrders = (orders || []).length;
          const totalAmount = (orders || []).reduce((sum: number, o: any) => sum + (o.total || 0), 0);
          const lastOrder = (orders || []).sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];

          return {
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            total_orders: totalOrders,
            total_amount: totalAmount,
            average_order: totalOrders > 0 ? totalAmount / totalOrders : 0,
            last_purchase_date: lastOrder?.created_at || '',
            top_products: [],
          };
        })
      );

      return supplierReports
        .filter(r => r.total_orders > 0)
        .sort((a, b) => b.total_amount - a.total_amount);
    } catch (err) {
      console.error('❌ ReportesService.obtenerReporteComprasProveedor:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerCategorias(): Promise<{ id: number; name: string }[]> {
    try {
      const organizationId = getOrganizationId();
      
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('❌ Error obteniendo categorías:', error.message);
        throw new Error(`Error obteniendo categorías: ${error.message}`);
      }
      return data || [];
    } catch (err) {
      console.error('❌ ReportesService.obtenerCategorias:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerSucursales(): Promise<{ id: number; name: string }[]> {
    try {
      const organizationId = getOrganizationId();
      
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('❌ Error obteniendo sucursales:', error.message);
        throw new Error(`Error obteniendo sucursales: ${error.message}`);
      }
      return data || [];
    } catch (err) {
      console.error('❌ ReportesService.obtenerSucursales:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerProductos(): Promise<{ id: number; name: string; sku: string }[]> {
    try {
      const organizationId = getOrganizationId();
      
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('❌ Error obteniendo productos:', error.message);
        throw new Error(`Error obteniendo productos: ${error.message}`);
      }
      return data || [];
    } catch (err) {
      console.error('❌ ReportesService.obtenerProductos:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static exportToCSV(data: any[], filename: string): void {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const value = row[h];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value ?? '';
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}
