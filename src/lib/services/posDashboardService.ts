import { supabase } from '@/lib/supabase/config';
import { getOrgDayRange, getOrgDateRange, getToday } from '@/lib/utils/timezone';

export interface PosKPIs {
  totalVentasHoy: number;
  totalVentasMes: number;
  numTransaccionesHoy: number;
  ticketPromedio: number;
  totalVentasWeb: number;
}

export interface TopProductoPos {
  productId: number;
  productName: string;
  sku: string | null;
  cantidad: number;
  total: number;
}

export interface VentaSucursalPos {
  branchId: number;
  branchName: string;
  totalVentas: number;
  numTransacciones: number;
}

export interface SesionCajaPos {
  id: number;
  branchName: string;
  currentBalance: number;
  openingAmount: number;
  openedAt: string;
}

interface SaleItemRow {
  quantity: number;
  total: number;
  product_id: number;
  products: { id: number; name: string; sku: string | null };
  sales: { status: string; organization_id: number };
}

interface SaleBranchRow {
  total: number;
  branch_id: number;
  branches: { id: number; name: string };
}

interface CashSessionRow {
  id: number;
  opened_at: string;
  initial_amount: number;
  status: string;
  branch_id: number;
  branches: { id: number; name: string };
}

interface CashMovementRow {
  cash_session_id: number;
  type: string;
  amount: number;
}

function getTodayRange(): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

class PosDashboardService {
  async getKPIs(organizationId: number): Promise<PosKPIs> {
    const { start: hoyStart, end: hoyEnd } = getTodayRange();
    const mesStart = getMonthStart();

    const [
      ventasHoyRes,
      ventasMesRes,
      ventasWebRes,
    ] = await Promise.all([
      // Ventas POS hoy: alineado con inicioService (status paid/completed)
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .in('status', ['paid', 'completed'])
        .gte('sale_date', hoyStart)
        .lte('sale_date', hoyEnd),
      // Ventas POS del mes: alineado con inicioService (sin filtro de estado)
      supabase
        .from('sales')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('sale_date', mesStart),
      // Pedidos web del mes: alineado con inicioService
      supabase
        .from('web_orders')
        .select('total')
        .eq('organization_id', organizationId)
        .gte('created_at', mesStart)
        .or('payment_status.eq.paid,status.eq.delivered')
        .not('status', 'in', '("cancelled","rejected")'),
    ]);

    if (ventasHoyRes.error) throw ventasHoyRes.error;
    if (ventasMesRes.error) throw ventasMesRes.error;
    if (ventasWebRes.error) throw ventasWebRes.error;

    const ventasHoy = (ventasHoyRes.data ?? []) as { total: number }[];
    const ventasMes = (ventasMesRes.data ?? []) as { total: number }[];
    const ventasWeb = (ventasWebRes.data ?? []) as { total: number }[];

    const totalVentasHoy = ventasHoy.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const numTransaccionesHoy = ventasHoy.length;
    const totalVentasMes = ventasMes.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const totalVentasWeb = ventasWeb.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const ticketPromedio = numTransaccionesHoy > 0 ? totalVentasHoy / numTransaccionesHoy : 0;

    return {
      totalVentasHoy,
      totalVentasMes,
      numTransaccionesHoy,
      ticketPromedio,
      totalVentasWeb,
    };
  }

  async getTopProductos(organizationId: number, limit = 5): Promise<TopProductoPos[]> {
    const { data, error } = await supabase
      .from('sale_items')
      .select(
        'quantity, total, product_id, products!inner(id, name, sku), sales!inner(status, organization_id)',
      )
      .eq('sales.organization_id', organizationId)
      .in('sales.status', ['paid', 'completed']);

    if (error) throw error;

    const rows = (data ?? []) as unknown as SaleItemRow[];
    const mapa = new Map<number, TopProductoPos>();

    rows.forEach((row) => {
      const pid = row.product_id;
      const existente = mapa.get(pid);
      const cantidad = Number(row.quantity || 0);
      const total = Number(row.total || 0);
      if (existente) {
        existente.cantidad += cantidad;
        existente.total += total;
      } else {
        mapa.set(pid, {
          productId: pid,
          productName: row.products?.name || 'Producto sin nombre',
          sku: row.products?.sku ?? null,
          cantidad,
          total,
        });
      }
    });

    return Array.from(mapa.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limit);
  }

  async getVentasPorSucursal(organizationId: number): Promise<VentaSucursalPos[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('total, branch_id, branches!inner(id, name)')
      .eq('organization_id', organizationId)
      .in('status', ['paid', 'completed']);

    if (error) throw error;

    const rows = (data ?? []) as unknown as SaleBranchRow[];
    const mapa = new Map<number, VentaSucursalPos>();

    rows.forEach((row) => {
      const bid = row.branch_id;
      const total = Number(row.total || 0);
      const existente = mapa.get(bid);
      if (existente) {
        existente.totalVentas += total;
        existente.numTransacciones += 1;
      } else {
        mapa.set(bid, {
          branchId: bid,
          branchName: row.branches?.name || 'Sucursal sin nombre',
          totalVentas: total,
          numTransacciones: 1,
        });
      }
    });

    return Array.from(mapa.values()).sort((a, b) => b.totalVentas - a.totalVentas);
  }

  async getSesionesCaja(organizationId: number): Promise<SesionCajaPos[]> {
    const [sesionesRes, movimientosRes] = await Promise.all([
      supabase
        .from('cash_sessions')
        .select('id, opened_at, initial_amount, status, branch_id, branches!inner(id, name)')
        .eq('organization_id', organizationId)
        .eq('status', 'open'),
      supabase
        .from('cash_movements')
        .select('cash_session_id, type, amount, cash_sessions!inner(status, organization_id)')
        .eq('cash_sessions.organization_id', organizationId)
        .eq('cash_sessions.status', 'open'),
    ]);

    if (sesionesRes.error) throw sesionesRes.error;
    if (movimientosRes.error) throw movimientosRes.error;

    const sesiones = (sesionesRes.data ?? []) as unknown as CashSessionRow[];
    const movimientos = (movimientosRes.data ?? []) as unknown as CashMovementRow[];

    const balances = new Map<number, number>();
    movimientos.forEach((m) => {
      const amount = Number(m.amount || 0);
      const delta = m.type === 'in' ? amount : m.type === 'out' ? -amount : 0;
      balances.set(m.cash_session_id, (balances.get(m.cash_session_id) || 0) + delta);
    });

    return sesiones.map((s) => ({
      id: s.id,
      branchName: s.branches?.name || 'Sucursal sin nombre',
      currentBalance: Number(s.initial_amount || 0) + (balances.get(s.id) || 0),
      openingAmount: Number(s.initial_amount || 0),
      openedAt: s.opened_at,
    }));
  }
}

export const posDashboardService = new PosDashboardService();
