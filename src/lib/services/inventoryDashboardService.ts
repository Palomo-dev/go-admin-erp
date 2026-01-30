import { supabase } from '@/lib/supabase/config';

// Interfaces para el Dashboard de Inventario
export interface InventoryKPIs {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalInventoryValue: number;
  totalCategories: number;
}

export interface StockAlert {
  id: number;
  type: 'low_stock' | 'out_of_stock' | 'expiring_lot' | 'pending_adjustment' | 'pending_transfer' | 'pending_purchase';
  severity: 'warning' | 'critical' | 'info';
  title: string;
  description: string;
  productId?: number;
  productName?: string;
  branchId?: number;
  branchName?: string;
  quantity?: number;
  minLevel?: number;
  expiryDate?: string;
  daysToExpire?: number;
}

export interface RecentMovement {
  id: number;
  type: string;
  productId: number;
  productName: string;
  productSku: string;
  branchId: number;
  branchName: string;
  quantity: number;
  source: string;
  createdAt: string;
}

export interface BranchSummary {
  branchId: number;
  branchName: string;
  totalStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: number;
}

export interface DashboardData {
  kpis: InventoryKPIs;
  alerts: StockAlert[];
  recentMovements: RecentMovement[];
  branchSummaries: BranchSummary[];
}

class InventoryDashboardService {
  /**
   * Obtiene los KPIs principales del inventario
   */
  async getKPIs(organizationId: number, branchId?: number | null): Promise<InventoryKPIs> {
    try {
      // Consulta de productos activos
      let productsQuery = supabase
        .from('products')
        .select('id, status, is_parent', { count: 'exact' })
        .eq('organization_id', organizationId);

      const { count: totalProducts } = await productsQuery;

      const { count: activeProducts } = await supabase
        .from('products')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .or('is_parent.is.null,is_parent.eq.false');

      // Consulta de stock levels con filtro opcional por sucursal
      let stockQuery = supabase
        .from('stock_levels')
        .select(`
          id,
          product_id,
          qty_on_hand,
          min_level,
          avg_cost,
          products!inner(organization_id, status, is_parent)
        `)
        .eq('products.organization_id', organizationId)
        .or('products.is_parent.is.null,products.is_parent.eq.false');

      if (branchId) {
        stockQuery = stockQuery.eq('branch_id', branchId);
      }

      const { data: stockData } = await stockQuery;

      // Calcular productos bajo mínimo y sin stock
      let lowStockProducts = 0;
      let outOfStockProducts = 0;
      let totalInventoryValue = 0;

      if (stockData) {
        stockData.forEach((item) => {
          const qty = Number(item.qty_on_hand) || 0;
          const minLevel = Number(item.min_level) || 0;
          const avgCost = Number(item.avg_cost) || 0;

          if (qty <= 0) {
            outOfStockProducts++;
          } else if (minLevel > 0 && qty <= minLevel) {
            lowStockProducts++;
          }

          totalInventoryValue += qty * avgCost;
        });
      }

      // Contar categorías
      const { count: totalCategories } = await supabase
        .from('categories')
        .select('id', { count: 'exact' })
        .eq('organization_id', organizationId);

      return {
        totalProducts: totalProducts || 0,
        activeProducts: activeProducts || 0,
        lowStockProducts,
        outOfStockProducts,
        totalInventoryValue,
        totalCategories: totalCategories || 0,
      };
    } catch (error) {
      console.error('Error obteniendo KPIs:', error);
      return {
        totalProducts: 0,
        activeProducts: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        totalInventoryValue: 0,
        totalCategories: 0,
      };
    }
  }

  /**
   * Obtiene las alertas de inventario
   */
  async getAlerts(organizationId: number, branchId?: number | null): Promise<StockAlert[]> {
    const alerts: StockAlert[] = [];
    let alertId = 1;

    try {
      // 1. Productos bajo mínimo
      let lowStockQuery = supabase
        .from('stock_levels')
        .select(`
          id,
          product_id,
          branch_id,
          qty_on_hand,
          min_level,
          products!inner(id, name, sku, organization_id, status, is_parent),
          branches!inner(id, name)
        `)
        .eq('products.organization_id', organizationId)
        .eq('products.status', 'active')
        .or('products.is_parent.is.null,products.is_parent.eq.false')
        .gt('min_level', 0);

      if (branchId) {
        lowStockQuery = lowStockQuery.eq('branch_id', branchId);
      }

      const { data: lowStockData } = await lowStockQuery;

      if (lowStockData) {
        lowStockData.forEach((item) => {
          const qty = Number(item.qty_on_hand) || 0;
          const minLevel = Number(item.min_level) || 0;
          const product = item.products as any;
          const branch = item.branches as any;

          if (qty <= 0) {
            alerts.push({
              id: alertId++,
              type: 'out_of_stock',
              severity: 'critical',
              title: 'Sin stock',
              description: `${product?.name} no tiene stock en ${branch?.name}`,
              productId: product?.id,
              productName: product?.name,
              branchId: branch?.id,
              branchName: branch?.name,
              quantity: qty,
              minLevel: minLevel,
            });
          } else if (qty <= minLevel) {
            alerts.push({
              id: alertId++,
              type: 'low_stock',
              severity: 'warning',
              title: 'Stock bajo',
              description: `${product?.name} tiene ${qty} unidades (mínimo: ${minLevel}) en ${branch?.name}`,
              productId: product?.id,
              productName: product?.name,
              branchId: branch?.id,
              branchName: branch?.name,
              quantity: qty,
              minLevel: minLevel,
            });
          }
        });
      }

      // 2. Lotes por vencer (próximos 30 días)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data: expiringLots } = await supabase
        .from('lots')
        .select(`
          id,
          lot_code,
          expiry_date,
          product_id,
          products!inner(id, name, organization_id)
        `)
        .eq('products.organization_id', organizationId)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .gte('expiry_date', new Date().toISOString().split('T')[0]);

      if (expiringLots) {
        expiringLots.forEach((lot) => {
          const product = lot.products as any;
          const expiryDate = new Date(lot.expiry_date as string);
          const today = new Date();
          const daysToExpire = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          alerts.push({
            id: alertId++,
            type: 'expiring_lot',
            severity: daysToExpire <= 7 ? 'critical' : 'warning',
            title: 'Lote por vencer',
            description: `Lote ${lot.lot_code} de ${product?.name} vence en ${daysToExpire} días`,
            productId: product?.id,
            productName: product?.name,
            expiryDate: lot.expiry_date as string,
            daysToExpire,
          });
        });
      }

      // 3. Ajustes pendientes
      let adjustmentsQuery = supabase
        .from('inventory_adjustments')
        .select('id, type, reason, status, created_at, branches!inner(name)')
        .eq('organization_id', organizationId)
        .eq('status', 'pending');

      if (branchId) {
        adjustmentsQuery = adjustmentsQuery.eq('branch_id', branchId);
      }

      const { data: pendingAdjustments } = await adjustmentsQuery;

      if (pendingAdjustments) {
        pendingAdjustments.forEach((adj) => {
          const branch = adj.branches as any;
          alerts.push({
            id: alertId++,
            type: 'pending_adjustment',
            severity: 'info',
            title: 'Ajuste pendiente',
            description: `Ajuste de ${adj.type} pendiente en ${branch?.name}`,
            branchId: adj.id,
            branchName: branch?.name,
          });
        });
      }

      // 4. Transferencias en tránsito
      const { data: pendingTransfers } = await supabase
        .from('inventory_transfers')
        .select(`
          id,
          status,
          origin_branch_id,
          dest_branch_id,
          origin_branch:branches!inventory_transfers_origin_branch_id_fkey(name),
          dest_branch:branches!inventory_transfers_dest_branch_id_fkey(name)
        `)
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'in_transit']);

      if (pendingTransfers) {
        pendingTransfers.forEach((transfer) => {
          const originBranch = transfer.origin_branch as any;
          const destBranch = transfer.dest_branch as any;
          alerts.push({
            id: alertId++,
            type: 'pending_transfer',
            severity: 'info',
            title: transfer.status === 'in_transit' ? 'Transferencia en tránsito' : 'Transferencia pendiente',
            description: `De ${originBranch?.name} a ${destBranch?.name}`,
          });
        });
      }

      // 5. Órdenes de compra pendientes
      const { data: pendingPurchases } = await supabase
        .from('purchase_orders')
        .select('id, status, expected_date, total, suppliers!inner(name), branches!inner(name)')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'confirmed']);

      if (pendingPurchases) {
        pendingPurchases.forEach((po) => {
          const supplier = po.suppliers as any;
          const branch = po.branches as any;
          const isOverdue = po.expected_date && new Date(po.expected_date) < new Date();
          alerts.push({
            id: alertId++,
            type: 'pending_purchase',
            severity: isOverdue ? 'warning' : 'info',
            title: isOverdue ? 'Compra atrasada' : 'Compra pendiente',
            description: `Orden de ${supplier?.name} para ${branch?.name}`,
          });
        });
      }

      return alerts.slice(0, 20); // Limitar a 20 alertas
    } catch (error) {
      console.error('Error obteniendo alertas:', error);
      return [];
    }
  }

  /**
   * Obtiene los movimientos recientes de inventario
   */
  async getRecentMovements(organizationId: number, branchId?: number | null, limit: number = 10): Promise<RecentMovement[]> {
    try {
      let query = supabase
        .from('stock_movements')
        .select(`
          id,
          direction,
          product_id,
          branch_id,
          qty,
          source,
          created_at,
          products(id, name, sku),
          branches(id, name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((mov) => {
        const product = mov.products as any;
        const branch = mov.branches as any;
        return {
          id: mov.id,
          type: mov.direction || 'unknown',
          productId: product?.id,
          productName: product?.name || 'Producto desconocido',
          productSku: product?.sku || '',
          branchId: branch?.id,
          branchName: branch?.name || 'Sucursal desconocida',
          quantity: Number(mov.qty) || 0,
          source: mov.source || '',
          createdAt: mov.created_at,
        };
      });
    } catch (error) {
      console.error('Error obteniendo movimientos recientes:', error);
      return [];
    }
  }

  /**
   * Obtiene el resumen por sucursal
   */
  async getBranchSummaries(organizationId: number): Promise<BranchSummary[]> {
    try {
      // Obtener sucursales activas
      const { data: branches } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (!branches) return [];

      const summaries: BranchSummary[] = [];

      for (const branch of branches) {
        const { data: stockData } = await supabase
          .from('stock_levels')
          .select(`
            qty_on_hand,
            min_level,
            avg_cost,
            products!inner(organization_id, status, is_parent)
          `)
          .eq('branch_id', branch.id)
          .eq('products.organization_id', organizationId)
          .or('products.is_parent.is.null,products.is_parent.eq.false');

        let totalStock = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let inventoryValue = 0;

        if (stockData) {
          stockData.forEach((item) => {
            const qty = Number(item.qty_on_hand) || 0;
            const minLevel = Number(item.min_level) || 0;
            const avgCost = Number(item.avg_cost) || 0;

            totalStock += qty;
            inventoryValue += qty * avgCost;

            if (qty <= 0) {
              outOfStockCount++;
            } else if (minLevel > 0 && qty <= minLevel) {
              lowStockCount++;
            }
          });
        }

        summaries.push({
          branchId: branch.id,
          branchName: branch.name,
          totalStock,
          lowStockCount,
          outOfStockCount,
          inventoryValue,
        });
      }

      return summaries;
    } catch (error) {
      console.error('Error obteniendo resumen por sucursal:', error);
      return [];
    }
  }

  /**
   * Obtiene todos los datos del dashboard en una sola llamada
   */
  async getDashboardData(organizationId: number, branchId?: number | null): Promise<DashboardData> {
    const [kpis, alerts, recentMovements, branchSummaries] = await Promise.all([
      this.getKPIs(organizationId, branchId),
      this.getAlerts(organizationId, branchId),
      this.getRecentMovements(organizationId, branchId),
      this.getBranchSummaries(organizationId),
    ]);

    return {
      kpis,
      alerts,
      recentMovements,
      branchSummaries,
    };
  }

  /**
   * Obtiene las sucursales de la organización
   */
  async getBranches(organizationId: number) {
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
   * Obtiene las categorías de la organización
   */
  async getCategories(organizationId: number) {
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
}

export const inventoryDashboardService = new InventoryDashboardService();
export default inventoryDashboardService;
