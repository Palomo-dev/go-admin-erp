import { supabase } from '@/lib/supabase/config';

export interface DashboardStats {
  arrivalsToday: number;
  departuresToday: number;
  occupancy: number;
  available: number;
  cleaning: number;
  maintenance: number;
  totalSpaces: number;
}

export interface Alert {
  id: string;
  type: 'unassigned' | 'block' | 'payment' | 'noshow';
  title: string;
  description: string;
  severity: 'warning' | 'error' | 'info';
  link?: string;
  createdAt: string;
}

export interface TodayArrival {
  id: string;
  code: string;
  customerName: string;
  customerEmail: string;
  checkin: string;
  checkout: string;
  spaces: string[];
  status: string;
  totalEstimated: number;
}

export interface TodayDeparture {
  id: string;
  code: string;
  customerName: string;
  spaces: string[];
  checkout: string;
  balance: number;
  status?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'arrival' | 'departure' | 'block' | 'maintenance';
  spaceLabel?: string;
}

export interface DateRangeFilter {
  from: Date;
  to: Date;
}

// ─── Tipos de filas de Supabase (evitan `any` en callbacks) ──────────────────

interface ReservationArrivalRow {
  id: string;
  metadata?: { code?: string } | null;
  customers?: { first_name?: string | null; last_name?: string | null; email?: string | null }[] | null;
  checkin: string;
  checkout: string;
  status: string;
  total_estimated?: number | null;
  reservation_spaces?: { spaces?: { label?: string }[] | null }[] | null;
}

interface ReservationDepartureRow {
  id: string;
  metadata?: { code?: string } | null;
  customers?: { first_name?: string | null; last_name?: string | null }[] | null;
  checkout: string;
  status?: string;
  reservation_spaces?: { spaces?: { label?: string }[] | null }[] | null;
  folios?: { balance?: number | null }[] | null;
}

interface ReservationPaymentRow {
  id: string;
  folios?: { balance?: number | null }[] | null;
}

interface CalendarArrivalRow {
  id: string;
  checkin: string;
  metadata?: { code?: string } | null;
  customers?: { first_name?: string | null; last_name?: string | null }[] | null;
  reservation_spaces?: { spaces?: { label?: string }[] | null }[] | null;
}

interface CalendarBlockRow {
  id: string;
  date_from: string;
  reason?: string | null;
  spaces?: { label?: string }[] | null;
}

interface MaintenanceOrderRow {
  id: string;
  description?: string | null;
  created_at?: string | null;
  spaces?: { label?: string }[] | null;
}

class PMSDashboardService {
  // Obtiene los IDs de sucursales pertenecientes a la organización.
  // Necesario porque spaces y maintenance_orders se filtran por branch_id,
  // no por organization_id.
  private async getBranchIds(organizationId: number): Promise<number[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error fetching branch ids:', error);
      return [];
    }

    return (data || []).map((b) => b.id as number);
  }

  async getDashboardStats(organizationId: number, dateRange?: DateRangeFilter): Promise<DashboardStats> {
    const fromDate = dateRange ? dateRange.from.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const toDate = dateRange ? dateRange.to.toISOString().split('T')[0] : fromDate;

    // Obtener branch_ids de la organización para filtrar spaces correctamente
    const branchIds = await this.getBranchIds(organizationId);

    // Get total spaces
    let spacesQuery = supabase
      .from('spaces')
      .select('id, status, branch_id');

    if (branchIds.length > 0) {
      spacesQuery = spacesQuery.in('branch_id', branchIds);
    } else {
      // Sin sucursales: devolver vacío para evitar traer spaces de otras orgs
      spacesQuery = spacesQuery.eq('branch_id', -1);
    }

    const { data: spacesData, error: spacesError } = await spacesQuery;

    if (spacesError) {
      console.error('Error fetching spaces:', spacesError);
      throw spacesError;
    }

    const spaces = spacesData || [];
    const totalSpaces = spaces.length;
    const available = spaces.filter(s => s.status === 'available').length;
    const occupied = spaces.filter(s => s.status === 'occupied').length;
    const cleaning = spaces.filter(s => s.status === 'cleaning').length;
    const maintenance = spaces.filter(s => s.status === 'maintenance' || s.status === 'out_of_order').length;

    // Get arrivals in date range
    const { count: arrivalsCount } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('checkin', fromDate)
      .lte('checkin', toDate)
      .in('status', ['confirmed', 'tentative']);

    // Get departures in date range
    const { count: departuresCount } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('checkout', fromDate)
      .lte('checkout', toDate)
      .in('status', ['checked_in', 'checked_out']);

    const occupancy = totalSpaces > 0 ? Math.round((occupied / totalSpaces) * 100) : 0;

    return {
      arrivalsToday: arrivalsCount || 0,
      departuresToday: departuresCount || 0,
      occupancy,
      available,
      cleaning,
      maintenance,
      totalSpaces,
    };
  }

  async getArrivals(organizationId: number, dateRange?: DateRangeFilter): Promise<TodayArrival[]> {
    const fromDate = dateRange ? dateRange.from.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const toDate = dateRange ? dateRange.to.toISOString().split('T')[0] : fromDate;

    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        start_date,
        end_date,
        checkin,
        checkout,
        status,
        total_estimated,
        notes,
        metadata,
        customers (
          id,
          first_name,
          last_name,
          email
        ),
        reservation_spaces (
          spaces (
            id,
            label
          )
        )
      `)
      .eq('organization_id', organizationId)
      .gte('checkin', fromDate)
      .lte('checkin', toDate)
      .in('status', ['confirmed', 'tentative'])
      .order('checkin', { ascending: true });

    if (error) {
      console.error('Error fetching arrivals:', error);
      throw error;
    }

    return (data || []).map((r: ReservationArrivalRow) => ({
      id: r.id,
      code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
      customerName: r.customers?.[0] ? `${r.customers[0].first_name || ''} ${r.customers[0].last_name || ''}`.trim() : 'Sin cliente',
      customerEmail: r.customers?.[0]?.email || '',
      checkin: r.checkin,
      checkout: r.checkout,
      spaces: r.reservation_spaces?.map((rs) => rs.spaces?.[0]?.label).filter(Boolean) as string[] || [],
      status: r.status,
      totalEstimated: r.total_estimated || 0,
    }));
  }

  async getDepartures(organizationId: number, dateRange?: DateRangeFilter): Promise<TodayDeparture[]> {
    const fromDate = dateRange ? dateRange.from.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const toDate = dateRange ? dateRange.to.toISOString().split('T')[0] : fromDate;

    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        checkout,
        status,
        metadata,
        customers (
          id,
          first_name,
          last_name
        ),
        reservation_spaces (
          spaces (
            id,
            label
          )
        ),
        folios (
          id,
          balance
        )
      `)
      .eq('organization_id', organizationId)
      .gte('checkout', fromDate)
      .lte('checkout', toDate)
      .in('status', ['checked_in', 'checked_out'])
      .order('checkout', { ascending: true });

    if (error) {
      console.error('Error fetching departures:', error);
      throw error;
    }

    return (data || []).map((r: ReservationDepartureRow) => ({
      id: r.id,
      code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
      customerName: r.customers?.[0] ? `${r.customers[0].first_name || ''} ${r.customers[0].last_name || ''}`.trim() : 'Sin cliente',
      spaces: r.reservation_spaces?.map((rs) => rs.spaces?.[0]?.label).filter(Boolean) as string[] || [],
      checkout: r.checkout,
      balance: r.folios?.[0]?.balance || 0,
      status: r.status,
    }));
  }

  async getAlerts(organizationId: number): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Reservations without space assignment
    const { data: unassigned } = await supabase
      .from('reservations')
      .select('id, metadata, checkin')
      .eq('organization_id', organizationId)
      .is('space_id', null)
      .in('status', ['confirmed', 'tentative'])
      .gte('checkin', today)
      .lte('checkin', tomorrow);

    if (unassigned && unassigned.length > 0) {
      alerts.push({
        id: 'unassigned-' + Date.now(),
        type: 'unassigned',
        title: 'Reservas sin asignación',
        description: `${unassigned.length} reserva(s) próximas sin espacio asignado`,
        severity: 'warning',
        link: '/app/pms/asignaciones',
        createdAt: new Date().toISOString(),
      });
    }

    // Upcoming blocks
    const { data: blocks } = await supabase
      .from('reservation_blocks')
      .select('id, reason, date_from, spaces(label)')
      .eq('organization_id', organizationId)
      .gte('date_from', today)
      .lte('date_from', tomorrow);

    if (blocks && blocks.length > 0) {
      alerts.push({
        id: 'blocks-' + Date.now(),
        type: 'block',
        title: 'Bloqueos próximos',
        description: `${blocks.length} bloqueo(s) iniciando hoy o mañana`,
        severity: 'info',
        link: '/app/pms/bloqueos',
        createdAt: new Date().toISOString(),
      });
    }

    // Pending payments (folios with balance > 0 for today's departures)
    const { data: pendingPayments } = await supabase
      .from('reservations')
      .select(`
        id,
        folios (balance)
      `)
      .eq('organization_id', organizationId)
      .eq('checkout', today)
      .eq('status', 'checked_in');

    const withBalance = pendingPayments?.filter((r: ReservationPaymentRow) =>
      r.folios?.some((f) => (f.balance ?? 0) > 0)
    );

    if (withBalance && withBalance.length > 0) {
      alerts.push({
        id: 'payments-' + Date.now(),
        type: 'payment',
        title: 'Pagos pendientes',
        description: `${withBalance.length} salida(s) de hoy con saldo pendiente`,
        severity: 'warning',
        link: '/app/pms/checkout',
        createdAt: new Date().toISOString(),
      });
    }

    return alerts;
  }

  async getWeekCalendarEvents(organizationId: number): Promise<CalendarEvent[]> {
    const today = new Date();
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const branchIds = await this.getBranchIds(organizationId);
    const events: CalendarEvent[] = [];

    // Arrivals this week
    const { data: arrivals } = await supabase
      .from('reservations')
      .select(`
        id,
        checkin,
        metadata,
        customers (first_name, last_name),
        reservation_spaces (spaces (label))
      `)
      .eq('organization_id', organizationId)
      .gte('checkin', todayStr)
      .lte('checkin', weekEndStr)
      .in('status', ['confirmed', 'tentative']);

    arrivals?.forEach((r: CalendarArrivalRow) => {
      events.push({
        id: `arrival-${r.id}`,
        title: r.customers?.[0] ? `${r.customers[0].first_name || ''} ${r.customers[0].last_name || ''}`.trim() : 'Llegada',
        date: r.checkin,
        type: 'arrival',
        spaceLabel: r.reservation_spaces?.[0]?.spaces?.[0]?.label,
      });
    });

    // Departures this week
    const { data: departures } = await supabase
      .from('reservations')
      .select(`
        id,
        checkout,
        metadata,
        customers (first_name, last_name),
        reservation_spaces (spaces (label))
      `)
      .eq('organization_id', organizationId)
      .gte('checkout', todayStr)
      .lte('checkout', weekEndStr)
      .eq('status', 'checked_in');

    departures?.forEach((r: ReservationDepartureRow) => {
      events.push({
        id: `departure-${r.id}`,
        title: r.customers?.[0] ? `${r.customers[0].first_name || ''} ${r.customers[0].last_name || ''}`.trim() : 'Salida',
        date: r.checkout,
        type: 'departure',
        spaceLabel: r.reservation_spaces?.[0]?.spaces?.[0]?.label,
      });
    });

    // Blocks this week
    const { data: blocks } = await supabase
      .from('reservation_blocks')
      .select('id, date_from, reason, spaces(label)')
      .eq('organization_id', organizationId)
      .gte('date_from', todayStr)
      .lte('date_from', weekEndStr);

    blocks?.forEach((b: CalendarBlockRow) => {
      events.push({
        id: `block-${b.id}`,
        title: b.reason || 'Bloqueo',
        date: b.date_from,
        type: 'block',
        spaceLabel: b.spaces?.[0]?.label,
      });
    });

    // Maintenance this week
    const maintenanceBranchIds = branchIds.length > 0 ? branchIds : [-1];
    const { data: maintenanceOrders } = await supabase
      .from('maintenance_orders')
      .select('id, description, created_at, spaces(label)')
      .in('branch_id', maintenanceBranchIds)
      .in('status', ['pending', 'in_progress']);

    maintenanceOrders?.forEach((m: MaintenanceOrderRow) => {
      events.push({
        id: `maintenance-${m.id}`,
        title: m.description?.substring(0, 30) || 'Mantenimiento',
        date: m.created_at?.split('T')[0] || todayStr,
        type: 'maintenance',
        spaceLabel: m.spaces?.[0]?.label,
      });
    });

    return events.sort((a, b) => a.date.localeCompare(b.date));
  }
}

const pmsDashboardServiceInstance = new PMSDashboardService();
export default pmsDashboardServiceInstance;
