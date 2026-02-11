import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface InventarioFilters {
  branchId: number | null;
  categoryId: number | null;
  stockStatus: string | null; // 'critico' | 'bajo' | 'normal' | 'sobre' | null
  dateFrom: string;
  dateTo: string;
}

export interface InventarioKPI {
  totalProductos: number;
  totalUnidades: number;
  valorInventario: number;
  productosStockCritico: number;
  productosStockBajo: number;
  productosSobrestock: number;
  movimientosEntrada: number;
  movimientosSalida: number;
}

export interface StockProducto {
  product_id: number;
  product_name: string;
  sku: string;
  category_name: string | null;
  branch_name: string;
  branch_id: number;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  min_level: number;
  avg_cost: number;
  valor_total: number;
  stock_status: 'critico' | 'bajo' | 'normal' | 'sobre';
}

export interface MovimientoStock {
  id: number;
  product_name: string;
  branch_name: string;
  direction: string;
  qty: number;
  unit_cost: number;
  source: string;
  note: string | null;
  created_at: string;
}

export interface MovimientoPorDia {
  fecha: string;
  entradas: number;
  salidas: number;
}

export interface StockPorCategoria {
  category_id: number;
  category_name: string;
  total_productos: number;
  total_unidades: number;
  valor_total: number;
}

export interface RotacionProducto {
  product_id: number;
  product_name: string;
  sku: string;
  stock_actual: number;
  unidades_vendidas: number;
  rotacion: number; // vendidas / stock
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStockStatus(qty: number, minLevel: number): 'critico' | 'bajo' | 'normal' | 'sobre' {
  if (qty <= 0) return 'critico';
  if (minLevel > 0 && qty <= minLevel) return 'bajo';
  if (minLevel > 0 && qty > minLevel * 3) return 'sobre';
  return 'normal';
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const inventarioReportService = {

  async getKPIs(organizationId: number, filters: InventarioFilters): Promise<InventarioKPI> {
    // Stock levels con productos de la org
    let stockQuery = supabase
      .from('stock_levels')
      .select('qty_on_hand, qty_reserved, avg_cost, min_level, product_id, branch_id, products!inner(organization_id)')
      .eq('products.organization_id', organizationId);

    if (filters.branchId) stockQuery = stockQuery.eq('branch_id', filters.branchId);

    const { data: stockData } = await stockQuery;

    let totalProductos = 0;
    let totalUnidades = 0;
    let valorInventario = 0;
    let productosStockCritico = 0;
    let productosStockBajo = 0;
    let productosSobrestock = 0;

    const seenProducts = new Set<number>();
    for (const s of stockData || []) {
      const qty = Number(s.qty_on_hand) || 0;
      const cost = Number(s.avg_cost) || 0;
      const minLvl = Number(s.min_level) || 0;

      if (!seenProducts.has(s.product_id)) {
        seenProducts.add(s.product_id);
        totalProductos++;
      }
      totalUnidades += qty;
      valorInventario += qty * cost;

      const status = getStockStatus(qty, minLvl);
      if (status === 'critico') productosStockCritico++;
      else if (status === 'bajo') productosStockBajo++;
      else if (status === 'sobre') productosSobrestock++;
    }

    // Movimientos del período
    let movQuery = supabase
      .from('stock_movements')
      .select('direction, qty')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    if (filters.branchId) movQuery = movQuery.eq('branch_id', filters.branchId);

    const { data: movData } = await movQuery;

    let movimientosEntrada = 0;
    let movimientosSalida = 0;
    for (const m of movData || []) {
      const qty = Number(m.qty) || 0;
      if (m.direction === 'in') movimientosEntrada += qty;
      else movimientosSalida += qty;
    }

    return {
      totalProductos, totalUnidades, valorInventario,
      productosStockCritico, productosStockBajo, productosSobrestock,
      movimientosEntrada, movimientosSalida,
    };
  },

  async getStockProductos(
    organizationId: number,
    filters: InventarioFilters
  ): Promise<StockProducto[]> {
    let query = supabase
      .from('stock_levels')
      .select('product_id, branch_id, qty_on_hand, qty_reserved, avg_cost, min_level, products!inner(id, name, sku, category_id, organization_id, categories(name)), branches!inner(name)')
      .eq('products.organization_id', organizationId);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data, error } = await query;
    if (error || !data) return [];

    let results: StockProducto[] = data.map((s: any) => {
      const qty = Number(s.qty_on_hand) || 0;
      const reserved = Number(s.qty_reserved) || 0;
      const cost = Number(s.avg_cost) || 0;
      const minLvl = Number(s.min_level) || 0;

      return {
        product_id: s.product_id,
        product_name: s.products?.name || 'Sin nombre',
        sku: s.products?.sku || '',
        category_name: s.products?.categories?.name || null,
        branch_name: s.branches?.name || '',
        branch_id: s.branch_id,
        qty_on_hand: qty,
        qty_reserved: reserved,
        qty_available: qty - reserved,
        min_level: minLvl,
        avg_cost: cost,
        valor_total: qty * cost,
        stock_status: getStockStatus(qty, minLvl),
      };
    });

    // Filtrar por categoría
    if (filters.categoryId) {
      results = results.filter((r: any) => {
        const item = data.find((d: any) => d.product_id === r.product_id && d.branch_id === r.branch_id);
        return item?.products?.[0]?.category_id === filters.categoryId;
      });
    }

    // Filtrar por estado de stock
    if (filters.stockStatus) {
      results = results.filter((r) => r.stock_status === filters.stockStatus);
    }

    return results.sort((a, b) => {
      const order = { critico: 0, bajo: 1, normal: 2, sobre: 3 };
      return order[a.stock_status] - order[b.stock_status];
    });
  },

  async getMovimientos(
    organizationId: number,
    filters: InventarioFilters,
    limit: number = 50
  ): Promise<MovimientoStock[]> {
    let query = supabase
      .from('stock_movements')
      .select('id, product_id, branch_id, direction, qty, unit_cost, source, note, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data, error } = await query;
    if (error || !data) return [];

    // Resolver nombres
    const productIds = Array.from(new Set(data.map((d) => d.product_id).filter(Boolean)));
    const branchIds = Array.from(new Set(data.map((d) => d.branch_id).filter(Boolean)));

    const [prodRes, branchRes] = await Promise.all([
      productIds.length > 0
        ? supabase.from('products').select('id, name').in('id', productIds)
        : { data: [] },
      branchIds.length > 0
        ? supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] },
    ]);

    const prodMap: Record<number, string> = {};
    for (const p of prodRes.data || []) prodMap[p.id] = p.name;
    const branchMap: Record<number, string> = {};
    for (const b of branchRes.data || []) branchMap[b.id] = b.name;

    return data.map((m) => ({
      id: m.id,
      product_name: prodMap[m.product_id] || `Producto #${m.product_id}`,
      branch_name: branchMap[m.branch_id] || '',
      direction: m.direction,
      qty: Number(m.qty) || 0,
      unit_cost: Number(m.unit_cost) || 0,
      source: m.source || '',
      note: m.note || null,
      created_at: m.created_at,
    }));
  },

  async getMovimientosPorDia(
    organizationId: number,
    filters: InventarioFilters
  ): Promise<MovimientoPorDia[]> {
    let query = supabase
      .from('stock_movements')
      .select('direction, qty, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
      .order('created_at', { ascending: true });

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data, error } = await query;
    if (error || !data) return [];

    const grouped: Record<string, { entradas: number; salidas: number }> = {};
    for (const m of data) {
      const fecha = new Date(m.created_at).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { entradas: 0, salidas: 0 };
      const qty = Number(m.qty) || 0;
      if (m.direction === 'in') grouped[fecha].entradas += qty;
      else grouped[fecha].salidas += qty;
    }

    return Object.entries(grouped).map(([fecha, v]) => ({
      fecha, entradas: v.entradas, salidas: v.salidas,
    }));
  },

  async getStockPorCategoria(
    organizationId: number,
    filters: InventarioFilters
  ): Promise<StockPorCategoria[]> {
    let query = supabase
      .from('stock_levels')
      .select('qty_on_hand, avg_cost, products!inner(category_id, organization_id, categories(id, name))')
      .eq('products.organization_id', organizationId);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data, error } = await query;
    if (error || !data) return [];

    const grouped: Record<number, { name: string; productos: Set<number>; unidades: number; valor: number }> = {};
    for (const s of data as any[]) {
      const catId = s.products?.category_id || 0;
      const catName = s.products?.categories?.name || 'Sin categoría';
      const qty = Number(s.qty_on_hand) || 0;
      const cost = Number(s.avg_cost) || 0;

      if (!grouped[catId]) grouped[catId] = { name: catName, productos: new Set(), unidades: 0, valor: 0 };
      grouped[catId].productos.add(s.product_id);
      grouped[catId].unidades += qty;
      grouped[catId].valor += qty * cost;
    }

    return Object.entries(grouped)
      .map(([cid, v]) => ({
        category_id: Number(cid),
        category_name: v.name,
        total_productos: v.productos.size,
        total_unidades: v.unidades,
        valor_total: v.valor,
      }))
      .sort((a, b) => b.valor_total - a.valor_total);
  },

  async getRotacionProductos(
    organizationId: number,
    filters: InventarioFilters,
    limit: number = 10
  ): Promise<RotacionProducto[]> {
    // Stock actual
    let stockQuery = supabase
      .from('stock_levels')
      .select('product_id, qty_on_hand, products!inner(id, name, sku, organization_id)')
      .eq('products.organization_id', organizationId);

    if (filters.branchId) stockQuery = stockQuery.eq('branch_id', filters.branchId);

    const { data: stockData } = await stockQuery;
    if (!stockData || stockData.length === 0) return [];

    // Agrupar stock por producto
    const stockMap: Record<number, { name: string; sku: string; qty: number }> = {};
    for (const s of stockData as any[]) {
      const pid = s.product_id;
      if (!stockMap[pid]) {
        stockMap[pid] = { name: s.products?.name || '', sku: s.products?.sku || '', qty: 0 };
      }
      stockMap[pid].qty += Number(s.qty_on_hand) || 0;
    }

    // Ventas en el período (sale_items)
    const { data: salesData } = await supabase
      .from('sales')
      .select('id')
      .eq('organization_id', organizationId)
      .gte('sale_date', filters.dateFrom)
      .lte('sale_date', filters.dateTo + 'T23:59:59.999Z')
      .neq('status', 'cancelled');

    if (!salesData || salesData.length === 0) {
      return Object.entries(stockMap)
        .map(([pid, v]) => ({
          product_id: Number(pid), product_name: v.name, sku: v.sku,
          stock_actual: v.qty, unidades_vendidas: 0, rotacion: 0,
        }))
        .sort((a, b) => b.stock_actual - a.stock_actual)
        .slice(0, limit);
    }

    const saleIds = salesData.map((s) => s.id);
    const allItems: any[] = [];
    for (let i = 0; i < saleIds.length; i += 100) {
      const batch = saleIds.slice(i, i + 100);
      const { data: items } = await supabase.from('sale_items').select('product_id, quantity').in('sale_id', batch);
      if (items) allItems.push(...items);
    }

    const soldMap: Record<number, number> = {};
    for (const item of allItems) {
      const pid = item.product_id;
      if (!pid) continue;
      soldMap[pid] = (soldMap[pid] || 0) + (Number(item.quantity) || 0);
    }

    return Object.entries(stockMap)
      .map(([pid, v]) => {
        const sold = soldMap[Number(pid)] || 0;
        return {
          product_id: Number(pid),
          product_name: v.name,
          sku: v.sku,
          stock_actual: v.qty,
          unidades_vendidas: sold,
          rotacion: v.qty > 0 ? sold / v.qty : 0,
        };
      })
      .sort((a, b) => b.rotacion - a.rotacion)
      .slice(0, limit);
  },

  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase
      .from('branches').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async getCategories(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase
      .from('categories').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async saveReport(
    organizationId: number, userId: string,
    report: { name: string; filters: InventarioFilters }
  ) {
    const { data, error } = await supabase.from('saved_reports').insert({
      organization_id: organizationId, user_id: userId,
      name: report.name, module: 'inventario', filters: report.filters as any,
    }).select().single();
    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  async getSavedReports(organizationId: number) {
    const { data } = await supabase.from('saved_reports').select('*')
      .eq('organization_id', organizationId).eq('module', 'inventario')
      .order('created_at', { ascending: false });
    return data || [];
  },
};
