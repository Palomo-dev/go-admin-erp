import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export interface SalesReport {
  total_sales: number;
  total_transactions: number;
  average_ticket: number;
  total_items_sold: number;
  total_taxes: number;
  total_discounts: number;
}

export interface ProductReport {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  total_revenue: number;
  category_name?: string;
}

export interface PaymentMethodReport {
  method: string;
  count: number;
  total: number;
}

export interface CashierReport {
  cashier_id: string;
  cashier_name: string;
  total_sales: number;
  transactions: number;
}

export interface DailySalesData {
  date: string;
  total: number;
  transactions: number;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  branchId?: number;
  cashierId?: string;
}

export class ReportesService {
  private static organizationId = getOrganizationId();

  static async setOrganizationContext(): Promise<void> {
    const orgId = getOrganizationId();
    await supabase.rpc('set_org_context', { org_id: orgId });
  }

  // Obtener resumen de ventas
  static async getSalesSummary(filters: ReportFilters): Promise<SalesReport> {
    const orgId = getOrganizationId();
    
    if (!orgId) {
      return {
        total_sales: 0,
        total_transactions: 0,
        average_ticket: 0,
        total_items_sold: 0,
        total_taxes: 0,
        total_discounts: 0,
      };
    }

    try {
      let query = supabase
        .from('sales')
        .select('id, total, subtotal, tax_total, discount_total')
        .eq('organization_id', orgId)
        .gte('sale_date', filters.startDate)
        .lte('sale_date', filters.endDate + 'T23:59:59')
        .in('status', ['completed', 'paid']);

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getSalesSummary:', error);
        throw error;
      }

      const totalSales = data?.reduce((sum, sale) => sum + Number(sale.total || 0), 0) || 0;
      const totalTaxes = data?.reduce((sum, sale) => sum + Number(sale.tax_total || 0), 0) || 0;
      const totalDiscounts = data?.reduce((sum, sale) => sum + Number(sale.discount_total || 0), 0) || 0;
      const totalTransactions = data?.length || 0;

      // Obtener total de items vendidos - consulta separada con los IDs de ventas
      let totalItems = 0;
      if (data && data.length > 0) {
        const saleIds = data.map(s => s.id);
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('quantity')
          .in('sale_id', saleIds);

        totalItems = itemsData?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
      }

      return {
        total_sales: totalSales,
        total_transactions: totalTransactions,
        average_ticket: totalTransactions > 0 ? totalSales / totalTransactions : 0,
        total_items_sold: totalItems,
        total_taxes: totalTaxes,
        total_discounts: totalDiscounts,
      };
    } catch (err) {
      console.error('Error en getSalesSummary:', err);
      return {
        total_sales: 0,
        total_transactions: 0,
        average_ticket: 0,
        total_items_sold: 0,
        total_taxes: 0,
        total_discounts: 0,
      };
    }
  }

  // Obtener productos más vendidos
  static async getTopProducts(filters: ReportFilters, limit: number = 10): Promise<ProductReport[]> {
    const orgId = getOrganizationId();

    if (!orgId) return [];

    try {
      // Primero obtener las ventas completadas en el rango
      let salesQuery = supabase
        .from('sales')
        .select('id')
        .eq('organization_id', orgId)
        .gte('sale_date', filters.startDate)
        .lte('sale_date', filters.endDate + 'T23:59:59')
        .in('status', ['completed', 'paid']);

      if (filters.branchId) {
        salesQuery = salesQuery.eq('branch_id', filters.branchId);
      }

      const { data: salesData, error: salesError } = await salesQuery;

      if (salesError || !salesData || salesData.length === 0) {
        return [];
      }

      const saleIds = salesData.map(s => s.id);

      // Obtener items de esas ventas con productos
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          quantity,
          total,
          products(id, name, category_id, categories(name))
        `)
        .in('sale_id', saleIds);

      if (error) {
        console.error('Error getTopProducts:', error);
        return [];
      }

      // Agrupar por producto
      const productMap = new Map<number, ProductReport>();
      
      data?.forEach(item => {
        const productId = item.product_id;
        if (!productId) return;
        
        const existing = productMap.get(productId);
        
        if (existing) {
          existing.quantity_sold += Number(item.quantity || 0);
          existing.total_revenue += Number(item.total || 0);
        } else {
          productMap.set(productId, {
            product_id: productId,
            product_name: (item.products as any)?.name || 'Producto',
            quantity_sold: Number(item.quantity || 0),
            total_revenue: Number(item.total || 0),
            category_name: (item.products as any)?.categories?.name,
          });
        }
      });

      // Ordenar por cantidad vendida y limitar
      return Array.from(productMap.values())
        .sort((a, b) => b.quantity_sold - a.quantity_sold)
        .slice(0, limit);
    } catch (err) {
      console.error('Error en getTopProducts:', err);
      return [];
    }
  }

  // Obtener ventas por método de pago
  static async getPaymentMethodsReport(filters: ReportFilters): Promise<PaymentMethodReport[]> {
    const orgId = getOrganizationId();

    if (!orgId) return [];

    try {
      // Consulta directa a payments filtrada por organization_id y fechas
      let query = supabase
        .from('payments')
        .select('method, amount, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', filters.startDate)
        .lte('created_at', filters.endDate + 'T23:59:59')
        .in('status', ['completed', 'paid']);

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getPaymentMethodsReport:', error);
        return [];
      }

      // Agrupar por método
      const methodMap = new Map<string, PaymentMethodReport>();
      
      data?.forEach(payment => {
        const method = payment.method || 'other';
        const existing = methodMap.get(method);
        
        if (existing) {
          existing.count += 1;
          existing.total += Number(payment.amount || 0);
        } else {
          methodMap.set(method, {
            method,
            count: 1,
            total: Number(payment.amount || 0),
          });
        }
      });

      return Array.from(methodMap.values()).sort((a, b) => b.total - a.total);
    } catch (err) {
      console.error('Error en getPaymentMethodsReport:', err);
      return [];
    }
  }

  // Obtener ventas diarias para gráfico
  static async getDailySales(filters: ReportFilters): Promise<DailySalesData[]> {
    const orgId = getOrganizationId();

    if (!orgId) return [];

    try {
      let query = supabase
        .from('sales')
        .select('sale_date, total')
        .eq('organization_id', orgId)
        .gte('sale_date', filters.startDate)
        .lte('sale_date', filters.endDate + 'T23:59:59')
        .in('status', ['completed', 'paid'])
        .order('sale_date', { ascending: true });

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getDailySales:', error);
        return [];
      }

      // Agrupar por fecha
      const dateMap = new Map<string, DailySalesData>();
      
      data?.forEach(sale => {
        const date = sale.sale_date ? sale.sale_date.split('T')[0] : '';
        if (!date) return;
        
        const existing = dateMap.get(date);
        
        if (existing) {
          existing.total += Number(sale.total || 0);
          existing.transactions += 1;
        } else {
          dateMap.set(date, {
            date,
            total: Number(sale.total || 0),
            transactions: 1,
          });
        }
      });

      return Array.from(dateMap.values());
    } catch (err) {
      console.error('Error en getDailySales:', err);
      return [];
    }
  }

  // Obtener reporte de caja (incluye ventas en el balance)
  static async getCashReport(filters: ReportFilters): Promise<any> {
    const orgId = getOrganizationId();

    if (!orgId) {
      return { sessions: [], totalIngresos: 0, totalEgresos: 0, totalVentas: 0, balance: 0 };
    }

    try {
      // Consulta de sesiones de caja
      let sessionsQuery = supabase
        .from('cash_sessions')
        .select(`
          id,
          initial_amount,
          final_amount,
          difference,
          status,
          opened_at,
          closed_at,
          branch_id
        `)
        .eq('organization_id', orgId)
        .gte('opened_at', filters.startDate)
        .lte('opened_at', filters.endDate + 'T23:59:59')
        .order('opened_at', { ascending: false });

      if (filters.branchId) {
        sessionsQuery = sessionsQuery.eq('branch_id', filters.branchId);
      }

      const { data: sessions, error } = await sessionsQuery;

      if (error) {
        console.error('Error getCashReport sessions:', error);
      }

      // Obtener movimientos - usando los campos correctos: type, concept
      const { data: movements, error: movError } = await supabase
        .from('cash_movements')
        .select('type, amount, concept')
        .eq('organization_id', orgId)
        .gte('created_at', filters.startDate)
        .lte('created_at', filters.endDate + 'T23:59:59');

      if (movError) {
        console.error('Error getCashReport movements:', movError);
      }

      // Obtener ventas del período para incluir en el balance
      let salesQuery = supabase
        .from('sales')
        .select('total')
        .eq('organization_id', orgId)
        .gte('sale_date', filters.startDate)
        .lte('sale_date', filters.endDate + 'T23:59:59')
        .in('status', ['completed', 'paid']);

      if (filters.branchId) {
        salesQuery = salesQuery.eq('branch_id', filters.branchId);
      }

      const { data: salesData } = await salesQuery;
      const totalVentas = salesData?.reduce((sum, s) => sum + Number(s.total || 0), 0) || 0;

      // Calcular totales - 'in' para ingresos, 'out' para egresos
      const totalIngresos = movements?.filter(m => m.type === 'in' || m.type === 'income' || m.type === 'ingreso')
        .reduce((sum, m) => sum + Number(m.amount || 0), 0) || 0;
      const totalEgresos = movements?.filter(m => m.type === 'out' || m.type === 'expense' || m.type === 'egreso')
        .reduce((sum, m) => sum + Number(m.amount || 0), 0) || 0;

      // Mapear sesiones al formato esperado por el componente
      const mappedSessions = (sessions || []).map(s => ({
        id: s.id,
        opening_balance: s.initial_amount,
        closing_balance: s.final_amount,
        expected_balance: s.initial_amount,
        difference: s.difference,
        status: s.status,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        cash_registers: { name: `Sucursal ${s.branch_id}` },
      }));

      // Balance = Ventas + Ingresos manuales - Egresos
      return {
        sessions: mappedSessions,
        totalIngresos,
        totalEgresos,
        totalVentas,
        balance: totalVentas + totalIngresos - totalEgresos,
      };
    } catch (err) {
      console.error('Error en getCashReport:', err);
      return { sessions: [], totalIngresos: 0, totalEgresos: 0, totalVentas: 0, balance: 0 };
    }
  }

  // Exportar a CSV
  static exportToCSV(data: any[], filename: string): void {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escapar comillas y envolver en comillas si contiene coma
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }

  // Obtener sucursales para filtro
  static async getBranches(): Promise<{ id: number; name: string }[]> {
    const orgId = getOrganizationId();

    if (!orgId) return [];

    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error getBranches:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Error en getBranches:', err);
      return [];
    }
  }

  // Obtener cajeros para filtro
  static async getCashiers(): Promise<{ id: string; name: string }[]> {
    const orgId = getOrganizationId();

    if (!orgId) return [];

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('organization_id', orgId);

      if (error) {
        console.error('Error getCashiers:', error);
        return [];
      }
      
      return data?.map(p => ({
        id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre',
      })) || [];
    } catch (err) {
      console.error('Error en getCashiers:', err);
      return [];
    }
  }
}
