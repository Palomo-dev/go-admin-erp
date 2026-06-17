import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface VentasFilters {
  dateFrom: string;
  dateTo: string;
  branchId: number | null;
  status: string | null;
  paymentStatus: string | null;
  userId: string | null;
}

export interface VentasKPI {
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  totalImpuestos: number;
  totalDescuentos: number;
  ventasPagadas: number;
  ventasPendientes: number;
}

export interface VentaPorDia {
  fecha: string;
  total: number;
  cantidad: number;
}

export interface VentaPorSucursal {
  branch_id: number;
  name: string;
  total: number;
  cantidad: number;
}

export interface VentaPorMetodoPago {
  method: string;
  total: number;
  count: number;
}

export interface TopProductoVenta {
  product_id: number;
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
  category_name: string | null;
}

export interface TopClienteVenta {
  customer_id: string;
  name: string;
  total: number;
  count: number;
}

export interface VentaDetalle {
  id: string;
  sale_date: string;
  total: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  status: string;
  payment_status: string;
  branch_name: string;
  customer_name: string | null;
  seller_name: string | null;
  items_count: number;
}

export interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  module: string;
  filters: Record<string, unknown>;
  columns: string[];
  grouping: string | null;
  is_favorite: boolean;
  created_at: string;
}

export interface ReportExecution {
  id: string;
  module: string;
  status: string;
  filters: Record<string, unknown>;
  row_count: number;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSalesQuery(organizationId: number, filters: VentasFilters) {
  let query = supabase
    .from('sales')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('sale_date', filters.dateFrom)
    .lte('sale_date', filters.dateTo + 'T23:59:59.999Z');

  if (filters.branchId) {
    query = query.eq('branch_id', filters.branchId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.paymentStatus) {
    query = query.eq('payment_status', filters.paymentStatus);
  }
  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  return query;
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const ventasReportService = {
  /**
   * KPIs de ventas filtrados
   */
  async getKPIs(
    organizationId: number,
    filters: VentasFilters
  ): Promise<VentasKPI> {
    const [posRes, webRes] = await Promise.all([
      buildSalesQuery(organizationId, filters)
        .neq('status', 'cancelled')
        .select('total, subtotal, tax_total, discount_total, payment_status'),
      supabase
        .from('web_orders')
        .select('total, subtotal, tax_total, discount_total, payment_status')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo + 'T23:59:59.999Z'),
    ]);

    const posData = posRes.data || [];
    const webData = webRes.data || [];
    const allData = [...posData, ...webData];

    if (allData.length === 0) {
      return {
        totalVentas: 0, cantidadVentas: 0, ticketPromedio: 0,
        totalImpuestos: 0, totalDescuentos: 0, ventasPagadas: 0, ventasPendientes: 0,
      };
    }

    const totalVentas = allData.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const cantidadVentas = allData.length;
    const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;
    const totalImpuestos = allData.reduce((s, r) => s + (Number(r.tax_total) || 0), 0);
    const totalDescuentos = allData.reduce((s, r) => s + (Number(r.discount_total) || 0), 0);
    const ventasPagadas = allData.filter((r) => r.payment_status === 'paid').length;
    const ventasPendientes = allData.filter((r) => r.payment_status === 'pending').length;

    return {
      totalVentas, cantidadVentas, ticketPromedio,
      totalImpuestos, totalDescuentos, ventasPagadas, ventasPendientes,
    };
  },

  /**
   * Ventas agrupadas por día
   */
  async getVentasPorDia(
    organizationId: number,
    filters: VentasFilters
  ): Promise<VentaPorDia[]> {
    const [posRes, webRes] = await Promise.all([
      buildSalesQuery(organizationId, filters)
        .neq('status', 'cancelled')
        .select('sale_date, total')
        .order('sale_date', { ascending: true }),
      supabase
        .from('web_orders')
        .select('created_at, total')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
        .order('created_at', { ascending: true }),
    ]);

    const grouped: Record<string, { total: number; cantidad: number }> = {};
    for (const sale of posRes.data || []) {
      const fecha = new Date(sale.sale_date).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { total: 0, cantidad: 0 };
      grouped[fecha].total += Number(sale.total) || 0;
      grouped[fecha].cantidad += 1;
    }
    for (const order of webRes.data || []) {
      const fecha = new Date(order.created_at).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { total: 0, cantidad: 0 };
      grouped[fecha].total += Number(order.total) || 0;
      grouped[fecha].cantidad += 1;
    }

    return Object.entries(grouped)
      .map(([fecha, v]) => ({ fecha, total: v.total, cantidad: v.cantidad }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  /**
   * Ventas agrupadas por sucursal
   */
  async getVentasPorSucursal(
    organizationId: number,
    filters: VentasFilters
  ): Promise<VentaPorSucursal[]> {
    const { data, error } = await buildSalesQuery(organizationId, filters)
      .neq('status', 'cancelled')
      .select('branch_id, total');

    if (error || !data) return [];

    const grouped: Record<number, { total: number; cantidad: number }> = {};
    for (const s of data) {
      if (!s.branch_id) continue;
      if (!grouped[s.branch_id]) grouped[s.branch_id] = { total: 0, cantidad: 0 };
      grouped[s.branch_id].total += Number(s.total) || 0;
      grouped[s.branch_id].cantidad += 1;
    }

    const branchIds = Object.keys(grouped).map(Number);
    if (branchIds.length === 0) return [];

    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .in('id', branchIds);

    const nameMap: Record<number, string> = {};
    for (const b of branches || []) nameMap[b.id] = b.name;

    return Object.entries(grouped)
      .map(([bid, v]) => ({
        branch_id: Number(bid),
        name: nameMap[Number(bid)] || `Sucursal ${bid}`,
        total: v.total,
        cantidad: v.cantidad,
      }))
      .sort((a, b) => b.total - a.total);
  },

  /**
   * Pagos por método de pago
   */
  async getPagosPorMetodo(
    organizationId: number,
    filters: VentasFilters
  ): Promise<VentaPorMetodoPago[]> {
    const [pagosRes, webRes] = await Promise.all([
      supabase
        .from('payments')
        .select('method, amount')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo + 'T23:59:59.999Z'),
      supabase
        .from('web_orders')
        .select('payment_method, total')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo + 'T23:59:59.999Z'),
    ]);

    const grouped: Record<string, { total: number; count: number }> = {};
    for (const p of pagosRes.data || []) {
      const method = p.method || 'Otro';
      if (!grouped[method]) grouped[method] = { total: 0, count: 0 };
      grouped[method].total += Number(p.amount) || 0;
      grouped[method].count += 1;
    }
    for (const wo of webRes.data || []) {
      const method = wo.payment_method || 'Web';
      if (!grouped[method]) grouped[method] = { total: 0, count: 0 };
      grouped[method].total += Number(wo.total) || 0;
      grouped[method].count += 1;
    }

    return Object.entries(grouped)
      .map(([method, v]) => ({ method, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total);
  },

  /**
   * Top productos vendidos
   */
  async getTopProductos(
    organizationId: number,
    filters: VentasFilters,
    limit: number = 10
  ): Promise<TopProductoVenta[]> {
    // Agrupar por producto (POS + Web)
    const grouped: Record<number, { name: string; sku: string; quantity: number; revenue: number; category_name: string | null }> = {};

    // POS sales
    const { data: salesData } = await buildSalesQuery(organizationId, filters)
      .neq('status', 'cancelled')
      .select('id');

    if (salesData && salesData.length > 0) {
      const saleIds = salesData.map((s) => s.id);
      const allItems: any[] = [];
      for (let i = 0; i < saleIds.length; i += 100) {
        const batch = saleIds.slice(i, i + 100);
        const { data: items } = await supabase
          .from('sale_items')
          .select('product_id, quantity, total')
          .in('sale_id', batch);
        if (items) allItems.push(...items);
      }
      for (const item of allItems) {
        const pid = item.product_id;
        if (!pid) continue;
        if (!grouped[pid]) grouped[pid] = { name: '', sku: '', quantity: 0, revenue: 0, category_name: null };
        grouped[pid].quantity += Number(item.quantity) || 0;
        grouped[pid].revenue += Number(item.total) || 0;
      }
    }

    // Web orders
    const { data: webOrders } = await supabase
      .from('web_orders')
      .select('id')
      .eq('organization_id', organizationId)
      .neq('status', 'cancelled')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    if (webOrders && webOrders.length > 0) {
      const webIds = webOrders.map((o) => o.id);
      const allWebItems: any[] = [];
      for (let i = 0; i < webIds.length; i += 100) {
        const batch = webIds.slice(i, i + 100);
        const { data: items } = await supabase
          .from('web_order_items')
          .select('product_id, product_name, quantity, total')
          .in('web_order_id', batch);
        if (items) allWebItems.push(...items);
      }
      for (const item of allWebItems) {
        const pid = item.product_id || 0;
        if (!pid) continue;
        if (!grouped[pid]) grouped[pid] = { name: item.product_name || 'Producto Web', sku: '', quantity: 0, revenue: 0, category_name: null };
        grouped[pid].quantity += Number(item.quantity) || 0;
        grouped[pid].revenue += Number(item.total) || 0;
      }
    }

    if (Object.keys(grouped).length === 0) return [];

    // Obtener nombres de productos
    const productIds = Object.keys(grouped).map(Number).filter((id) => id > 0);
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, category_id, categories(name)')
        .in('id', productIds);

      for (const p of products || []) {
        if (grouped[p.id]) {
          grouped[p.id].name = p.name || grouped[p.id].name;
          grouped[p.id].sku = p.sku || '';
          grouped[p.id].category_name = (p.categories as any)?.name || null;
        }
      }
    }

    return Object.entries(grouped)
      .map(([pid, v]) => ({
        product_id: Number(pid),
        name: v.name || `Producto #${pid}`,
        sku: v.sku,
        quantity: v.quantity,
        revenue: v.revenue,
        category_name: v.category_name,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },

  /**
   * Top clientes
   */
  async getTopClientes(
    organizationId: number,
    filters: VentasFilters,
    limit: number = 10
  ): Promise<TopClienteVenta[]> {
    const [posRes, webRes] = await Promise.all([
      supabase
        .from('sales')
        .select('customer_id, total')
        .eq('organization_id', organizationId)
        .gte('sale_date', filters.dateFrom)
        .lte('sale_date', filters.dateTo + 'T23:59:59.999Z')
        .neq('status', 'cancelled')
        .not('customer_id', 'is', null),
      supabase
        .from('web_orders')
        .select('customer_id, customer_name, total')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('created_at', filters.dateFrom)
        .lte('created_at', filters.dateTo + 'T23:59:59.999Z'),
    ]);

    const grouped: Record<string, { total: number; count: number; name?: string }> = {};

    for (const s of posRes.data || []) {
      if (!s.customer_id) continue;
      if (!grouped[s.customer_id]) grouped[s.customer_id] = { total: 0, count: 0 };
      grouped[s.customer_id].total += Number(s.total) || 0;
      grouped[s.customer_id].count += 1;
    }
    for (const wo of webRes.data || []) {
      const key = wo.customer_id || wo.customer_name || 'web-anonymous';
      if (!grouped[key]) grouped[key] = { total: 0, count: 0, name: wo.customer_name || undefined };
      grouped[key].total += Number(wo.total) || 0;
      grouped[key].count += 1;
    }

    if (Object.keys(grouped).length === 0) return [];

    // Obtener nombres de clientes con UUID
    const customerIds = Object.keys(grouped).filter((id) => id.includes('-') && id.length > 30);
    const nameMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, full_name, first_name, last_name')
        .in('id', customerIds);
      for (const c of customers || []) {
        nameMap[c.id] = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sin nombre';
      }
    }

    return Object.entries(grouped)
      .map(([cid, v]) => ({
        customer_id: cid,
        name: nameMap[cid] || v.name || 'Cliente sin nombre',
        total: v.total,
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  },

  /**
   * Detalle de ventas (tabla paginada)
   */
  async getVentasDetalle(
    organizationId: number,
    filters: VentasFilters,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ data: VentaDetalle[]; total: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Count
    const { count } = await supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('sale_date', filters.dateFrom)
      .lte('sale_date', filters.dateTo + 'T23:59:59.999Z');

    // Data
    const { data, error } = await buildSalesQuery(organizationId, filters)
      .select(`
        id, sale_date, total, subtotal, tax_total, discount_total, status, payment_status,
        branch_id, customer_id, user_id
      `)
      .order('sale_date', { ascending: false })
      .range(from, to);

    if (error || !data) return { data: [], total: count ?? 0 };

    // Resolver nombres
    const branchIds = Array.from(new Set(data.map((d) => d.branch_id).filter(Boolean)));
    const customerIds = Array.from(new Set(data.map((d) => d.customer_id).filter(Boolean)));
    const userIds = Array.from(new Set(data.map((d) => d.user_id).filter(Boolean)));

    const [branchesRes, customersRes, profilesRes] = await Promise.all([
      branchIds.length > 0
        ? supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] },
      customerIds.length > 0
        ? supabase.from('customers').select('id, full_name, first_name, last_name').in('id', customerIds)
        : { data: [] },
      userIds.length > 0
        ? supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
        : { data: [] },
    ]);

    const branchMap: Record<number, string> = {};
    for (const b of branchesRes.data || []) branchMap[b.id] = b.name;

    const customerMap: Record<string, string> = {};
    for (const c of customersRes.data || []) {
      customerMap[c.id] = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
    }

    const profileMap: Record<string, string> = {};
    for (const p of profilesRes.data || []) {
      profileMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    }

    return {
      data: data.map((s) => ({
        id: s.id,
        sale_date: s.sale_date,
        total: Number(s.total) || 0,
        subtotal: Number(s.subtotal) || 0,
        tax_total: Number(s.tax_total) || 0,
        discount_total: Number(s.discount_total) || 0,
        status: s.status || '',
        payment_status: s.payment_status || '',
        branch_name: branchMap[s.branch_id] || '',
        customer_name: customerMap[s.customer_id] || null,
        seller_name: profileMap[s.user_id] || null,
        items_count: 0,
      })),
      total: count ?? 0,
    };
  },

  /**
   * Obtener sucursales de la organización
   */
  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');
    return data || [];
  },

  /**
   * Obtener vendedores (profiles con membresía activa)
   */
  async getSellers(organizationId: number): Promise<{ id: string; name: string }[]> {
    const { data } = await supabase
      .from('organization_members')
      .select('user_id, profiles(id, first_name, last_name)')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!data) return [];

    return data
      .filter((m: any) => m.profiles)
      .map((m: any) => ({
        id: m.user_id,
        name: `${m.profiles.first_name || ''} ${m.profiles.last_name || ''}`.trim() || 'Sin nombre',
      }));
  },

  /**
   * Guardar reporte
   */
  async saveReport(
    organizationId: number,
    userId: string,
    report: { name: string; description?: string; filters: VentasFilters; grouping?: string }
  ): Promise<SavedReport | null> {
    const { data, error } = await supabase
      .from('saved_reports')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        name: report.name,
        description: report.description || null,
        module: 'ventas',
        filters: report.filters as any,
        grouping: report.grouping || null,
      })
      .select()
      .single();

    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  /**
   * Listar reportes guardados
   */
  async getSavedReports(organizationId: number): Promise<SavedReport[]> {
    const { data } = await supabase
      .from('saved_reports')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('module', 'ventas')
      .order('created_at', { ascending: false });
    return data || [];
  },

  /**
   * Últimas ejecuciones
   */
  async getRecentExecutions(organizationId: number, limit: number = 5): Promise<ReportExecution[]> {
    const { data } = await supabase
      .from('report_executions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('module', 'ventas')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  },

  /**
   * Registrar ejecución
   */
  async logExecution(
    organizationId: number,
    userId: string,
    filters: VentasFilters,
    rowCount: number,
    durationMs: number,
    status: string = 'completed'
  ): Promise<void> {
    await supabase.from('report_executions').insert({
      organization_id: organizationId,
      user_id: userId,
      module: 'ventas',
      filters: filters as any,
      row_count: rowCount,
      duration_ms: durationMs,
      status,
    });
  },
};
