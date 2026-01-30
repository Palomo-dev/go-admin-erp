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
  status: string;
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

class PMSDashboardService {
  async getDashboardStats(organizationId: number, dateRange?: DateRangeFilter): Promise<DashboardStats> {
    const fromDate = dateRange ? dateRange.from.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const toDate = dateRange ? dateRange.to.toISOString().split('T')[0] : fromDate;

    // Get total spaces
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select('id, status, branch_id')
      .eq('branch_id', organizationId);

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

    return (data || []).map((r: any) => ({
      id: r.id,
      code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
      customerName: r.customers ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() : 'Sin cliente',
      customerEmail: r.customers?.email || '',
      checkin: r.checkin,
      checkout: r.checkout,
      spaces: r.reservation_spaces?.map((rs: any) => rs.spaces?.label).filter(Boolean) || [],
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

    return (data || []).map((r: any) => ({
      id: r.id,
      code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
      customerName: r.customers ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() : 'Sin cliente',
      spaces: r.reservation_spaces?.map((rs: any) => rs.spaces?.label).filter(Boolean) || [],
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

    const withBalance = pendingPayments?.filter((r: any) => 
      r.folios?.some((f: any) => f.balance > 0)
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

    arrivals?.forEach((r: any) => {
      events.push({
        id: `arrival-${r.id}`,
        title: r.customers ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() : 'Llegada',
        date: r.checkin,
        type: 'arrival',
        spaceLabel: r.reservation_spaces?.[0]?.spaces?.label,
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

    departures?.forEach((r: any) => {
      events.push({
        id: `departure-${r.id}`,
        title: r.customers ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() : 'Salida',
        date: r.checkout,
        type: 'departure',
        spaceLabel: r.reservation_spaces?.[0]?.spaces?.label,
      });
    });

    // Blocks this week
    const { data: blocks } = await supabase
      .from('reservation_blocks')
      .select('id, date_from, reason, spaces(label)')
      .eq('organization_id', organizationId)
      .gte('date_from', todayStr)
      .lte('date_from', weekEndStr);

    blocks?.forEach((b: any) => {
      events.push({
        id: `block-${b.id}`,
        title: b.reason || 'Bloqueo',
        date: b.date_from,
        type: 'block',
        spaceLabel: b.spaces?.label,
      });
    });

    // Maintenance this week
    const { data: maintenanceOrders } = await supabase
      .from('maintenance_orders')
      .select('id, description, created_at, spaces(label)')
      .eq('branch_id', organizationId)
      .in('status', ['pending', 'in_progress']);

    maintenanceOrders?.forEach((m: any) => {
      events.push({
        id: `maintenance-${m.id}`,
        title: m.description?.substring(0, 30) || 'Mantenimiento',
        date: m.created_at?.split('T')[0] || todayStr,
        type: 'maintenance',
        spaceLabel: m.spaces?.label,
      });
    });

    return events.sort((a, b) => a.date.localeCompare(b.date));
  }
}

export default new PMSDashboardService();
