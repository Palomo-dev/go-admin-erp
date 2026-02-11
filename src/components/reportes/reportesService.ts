import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface KPIData {
  ventasHoy: number;
  ventasMes: number;
  ingresosNetosMes: number;
  ticketPromedio: number;
  totalFacturas: number;
  reservasActivas: number;
  productosActivos: number;
  pagosRecibidosMes: number;
}

export interface VentaDiaria {
  fecha: string;
  total: number;
  cantidad: number;
}

export interface PagoMetodo {
  method: string;
  total: number;
  count: number;
}

export interface TopProducto {
  product_id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface TopSucursal {
  branch_id: number;
  name: string;
  total: number;
  count: number;
}

export interface OcupacionData {
  total_reservas: number;
  checkins_hoy: number;
  checkouts_hoy: number;
  ocupacion_actual: number;
}

export interface ActividadReciente {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  user_id: string;
  details: Record<string, unknown>;
}

export interface ReportesDashboardData {
  kpis: KPIData;
  ventasDiarias: VentaDiaria[];
  pagosPorMetodo: PagoMetodo[];
  topProductos: TopProducto[];
  topSucursales: TopSucursal[];
  ocupacion: OcupacionData;
  actividadReciente: ActividadReciente[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const reportesService = {
  /**
   * Obtiene los KPIs principales del dashboard
   */
  async getKPIs(organizationId: number, dias: number = 30): Promise<KPIData> {
    const today = startOfToday();
    const periodoStart = daysAgo(dias);

    // Ejecutar queries en paralelo
    const [
      ventasHoyRes,
      ventasPeriodoRes,
      facturasRes,
      reservasRes,
      productosRes,
      pagosPeriodoRes,
    ] = await Promise.all([
      // Ventas de hoy
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', today)
        .neq('status', 'cancelled'),

      // Ventas del período
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', periodoStart)
        .neq('status', 'cancelled'),

      // Total facturas del período
      supabase
        .from('invoice_sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('issue_date', periodoStart),

      // Reservas activas
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in']),

      // Productos activos
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'active'),

      // Pagos recibidos del período
      supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('created_at', periodoStart),
    ]);

    const ventasHoyTotal = (ventasHoyRes.data || []).reduce(
      (sum, s) => sum + (Number(s.total) || 0),
      0
    );
    const ventasPeriodoArr = ventasPeriodoRes.data || [];
    const ventasPeriodoTotal = ventasPeriodoArr.reduce(
      (sum, s) => sum + (Number(s.total) || 0),
      0
    );
    const ticketPromedio =
      ventasPeriodoArr.length > 0 ? ventasPeriodoTotal / ventasPeriodoArr.length : 0;

    const pagosPeriodoTotal = (pagosPeriodoRes.data || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

    return {
      ventasHoy: ventasHoyTotal,
      ventasMes: ventasPeriodoTotal,
      ingresosNetosMes: pagosPeriodoTotal,
      ticketPromedio,
      totalFacturas: facturasRes.count ?? 0,
      reservasActivas: reservasRes.count ?? 0,
      productosActivos: productosRes.count ?? 0,
      pagosRecibidosMes: pagosPeriodoTotal,
    };
  },

  /**
   * Ventas diarias de los últimos N días
   */
  async getVentasDiarias(
    organizationId: number,
    dias: number = 30
  ): Promise<VentaDiaria[]> {
    const desde = daysAgo(dias);

    const { data, error } = await supabase
      .from('sales')
      .select('sale_date, total')
      .eq('organization_id', organizationId)
      .gte('sale_date', desde)
      .neq('status', 'cancelled')
      .order('sale_date', { ascending: true });

    if (error || !data) return [];

    // Agrupar por fecha
    const grouped: Record<string, { total: number; cantidad: number }> = {};
    for (const sale of data) {
      const fecha = new Date(sale.sale_date).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { total: 0, cantidad: 0 };
      grouped[fecha].total += Number(sale.total) || 0;
      grouped[fecha].cantidad += 1;
    }

    return Object.entries(grouped).map(([fecha, v]) => ({
      fecha,
      total: v.total,
      cantidad: v.cantidad,
    }));
  },

  /**
   * Pagos agrupados por método
   */
  async getPagosPorMetodo(
    organizationId: number,
    dias: number = 30
  ): Promise<PagoMetodo[]> {
    const desde = daysAgo(dias);

    const { data, error } = await supabase
      .from('payments')
      .select('method, amount')
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .gte('created_at', desde);

    if (error || !data) return [];

    const grouped: Record<string, { total: number; count: number }> = {};
    for (const p of data) {
      const method = p.method || 'Otro';
      if (!grouped[method]) grouped[method] = { total: 0, count: 0 };
      grouped[method].total += Number(p.amount) || 0;
      grouped[method].count += 1;
    }

    return Object.entries(grouped)
      .map(([method, v]) => ({ method, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total);
  },

  /**
   * Top productos vendidos del mes
   */
  async getTopProductos(
    organizationId: number,
    limit: number = 5,
    dias: number = 30
  ): Promise<TopProducto[]> {
    const periodoStart = daysAgo(dias);

    const { data: salesData } = await supabase
      .from('sales')
      .select('id')
      .eq('organization_id', organizationId)
      .gte('sale_date', periodoStart)
      .neq('status', 'cancelled');

    if (!salesData || salesData.length === 0) return [];

    const saleIds = salesData.map((s) => s.id);

    const { data: items } = await supabase
      .from('sale_items')
      .select('product_id, quantity, total, products(name)')
      .in('sale_id', saleIds);

    if (!items) return [];

    const grouped: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};

    for (const item of items) {
      const pid = item.product_id;
      if (!pid) continue;
      if (!grouped[pid]) {
        const productName =
          (item.products as any)?.name || 'Producto sin nombre';
        grouped[pid] = { name: productName, quantity: 0, revenue: 0 };
      }
      grouped[pid].quantity += Number(item.quantity) || 0;
      grouped[pid].revenue += Number(item.total) || 0;
    }

    return Object.entries(grouped)
      .map(([product_id, v]) => ({
        product_id,
        name: v.name,
        quantity: v.quantity,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },

  /**
   * Top sucursales por ventas del mes
   */
  async getTopSucursales(
    organizationId: number,
    dias: number = 30
  ): Promise<TopSucursal[]> {
    const periodoStart = daysAgo(dias);

    const { data: salesData } = await supabase
      .from('sales')
      .select('branch_id, total')
      .eq('organization_id', organizationId)
      .gte('sale_date', periodoStart)
      .neq('status', 'cancelled');

    if (!salesData || salesData.length === 0) return [];

    // Agrupar por sucursal
    const grouped: Record<number, { total: number; count: number }> = {};
    for (const s of salesData) {
      const bid = s.branch_id;
      if (!bid) continue;
      if (!grouped[bid]) grouped[bid] = { total: 0, count: 0 };
      grouped[bid].total += Number(s.total) || 0;
      grouped[bid].count += 1;
    }

    // Obtener nombres de sucursales
    const branchIds = Object.keys(grouped).map(Number);
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .in('id', branchIds);

    const branchMap: Record<number, string> = {};
    for (const b of branches || []) {
      branchMap[b.id] = b.name;
    }

    return Object.entries(grouped)
      .map(([bid, v]) => ({
        branch_id: Number(bid),
        name: branchMap[Number(bid)] || `Sucursal ${bid}`,
        total: v.total,
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total);
  },

  /**
   * Datos de ocupación hotelera
   */
  async getOcupacion(organizationId: number): Promise<OcupacionData> {
    const todayStr = new Date().toISOString().split('T')[0];

    const [totalRes, checkinsRes, checkoutsRes, ocupacionRes] =
      await Promise.all([
        supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('status', ['confirmed', 'checked_in', 'checked_out']),

        // Check-ins de hoy
        supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('checkin', todayStr)
          .in('status', ['confirmed', 'checked_in']),

        // Check-outs de hoy
        supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('checkout', todayStr)
          .in('status', ['checked_in', 'checked_out']),

        // Actualmente ocupadas
        supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'checked_in'),
      ]);

    return {
      total_reservas: totalRes.count ?? 0,
      checkins_hoy: checkinsRes.count ?? 0,
      checkouts_hoy: checkoutsRes.count ?? 0,
      ocupacion_actual: ocupacionRes.count ?? 0,
    };
  },

  /**
   * Actividad reciente (audit log)
   */
  async getActividadReciente(
    organizationId: number,
    limit: number = 10
  ): Promise<ActividadReciente[]> {
    const { data, error } = await supabase
      .from('ops_audit_log')
      .select('id, action, entity_type, entity_id, created_at, user_id, metadata')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((item) => ({
      id: item.id,
      action: item.action || '',
      entity_type: item.entity_type || '',
      entity_id: item.entity_id || '',
      created_at: item.created_at,
      user_id: item.user_id || '',
      details: (item.metadata as Record<string, unknown>) || {},
    }));
  },

  /**
   * Carga todos los datos del dashboard de una vez
   */
  async getDashboardData(
    organizationId: number,
    dias: number = 30
  ): Promise<ReportesDashboardData> {
    const [
      kpis,
      ventasDiarias,
      pagosPorMetodo,
      topProductos,
      topSucursales,
      ocupacion,
      actividadReciente,
    ] = await Promise.all([
      this.getKPIs(organizationId, dias),
      this.getVentasDiarias(organizationId, dias),
      this.getPagosPorMetodo(organizationId, dias),
      this.getTopProductos(organizationId, 5, dias),
      this.getTopSucursales(organizationId, dias),
      this.getOcupacion(organizationId),
      this.getActividadReciente(organizationId),
    ]);

    return {
      kpis,
      ventasDiarias,
      pagosPorMetodo,
      topProductos,
      topSucursales,
      ocupacion,
      actividadReciente,
    };
  },
};
