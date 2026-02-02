import { supabase } from '@/lib/supabase/config';

export interface OccupancyByHour {
  hour: number;
  sessions: number;
  avgDuration: number;
}

export interface RevenueByPeriod {
  period: string;
  revenue: number;
  sessions: number;
}

export interface ZoneStats {
  zone_id: string;
  zone_name: string;
  total_sessions: number;
  total_revenue: number;
  avg_duration: number;
  occupancy_rate: number;
}

export interface VehicleTypeStats {
  vehicle_type: string;
  count: number;
  revenue: number;
  percentage: number;
}

export interface PassVsOccasional {
  subscribers: number;
  occasional: number;
  subscriber_revenue: number;
  occasional_revenue: number;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  branchId?: number;
  zoneId?: string;
  vehicleType?: string;
}

export interface ReportSummary {
  total_sessions: number;
  total_revenue: number;
  avg_duration: number;
  avg_ticket: number;
  occupancy_rate: number;
  rotation_index: number;
}

class ParkingReportService {
  /**
   * Obtener resumen general de reportes
   */
  async getReportSummary(
    organizationId: number,
    filters: ReportFilters
  ): Promise<ReportSummary> {
    try {
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('*, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate)
        .eq('status', 'closed');

      if (error) throw error;

      const sessionsList = sessions || [];
      const totalSessions = sessionsList.length;
      const totalRevenue = sessionsList.reduce((sum, s) => sum + Number(s.amount || 0), 0);
      const totalDuration = sessionsList.reduce((sum, s) => sum + Number(s.duration_min || 0), 0);

      // Obtener capacidad total para calcular ocupación
      const { data: spaces } = await supabase
        .from('parking_spaces')
        .select('id, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId);

      const totalSpaces = spaces?.length || 1;

      return {
        total_sessions: totalSessions,
        total_revenue: totalRevenue,
        avg_duration: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
        avg_ticket: totalSessions > 0 ? Math.round(totalRevenue / totalSessions) : 0,
        occupancy_rate: Math.min(100, Math.round((totalSessions / (totalSpaces * 24)) * 100)),
        rotation_index: totalSpaces > 0 ? Math.round((totalSessions / totalSpaces) * 10) / 10 : 0,
      };
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      throw error;
    }
  }

  /**
   * Obtener ocupación por hora del día
   */
  async getOccupancyByHour(
    organizationId: number,
    filters: ReportFilters
  ): Promise<OccupancyByHour[]> {
    try {
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('entry_at, duration_min, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate);

      if (error) throw error;

      // Agrupar por hora
      const hourlyData: { [key: number]: { count: number; totalDuration: number } } = {};
      for (let i = 0; i < 24; i++) {
        hourlyData[i] = { count: 0, totalDuration: 0 };
      }

      (sessions || []).forEach((session) => {
        const hour = new Date(session.entry_at).getHours();
        hourlyData[hour].count++;
        hourlyData[hour].totalDuration += session.duration_min || 0;
      });

      return Object.entries(hourlyData).map(([hour, data]) => ({
        hour: parseInt(hour),
        sessions: data.count,
        avgDuration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
      }));
    } catch (error) {
      console.error('Error obteniendo ocupación por hora:', error);
      throw error;
    }
  }

  /**
   * Obtener ingresos por período (día/semana/mes)
   */
  async getRevenueByPeriod(
    organizationId: number,
    filters: ReportFilters,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<RevenueByPeriod[]> {
    try {
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('entry_at, amount, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate)
        .eq('status', 'closed');

      if (error) throw error;

      const periodData: { [key: string]: { revenue: number; sessions: number } } = {};

      (sessions || []).forEach((session) => {
        const date = new Date(session.entry_at);
        let periodKey: string;

        if (groupBy === 'day') {
          periodKey = date.toISOString().split('T')[0];
        } else if (groupBy === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
        } else {
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        if (!periodData[periodKey]) {
          periodData[periodKey] = { revenue: 0, sessions: 0 };
        }
        periodData[periodKey].revenue += Number(session.amount || 0);
        periodData[periodKey].sessions++;
      });

      return Object.entries(periodData)
        .map(([period, data]) => ({
          period,
          revenue: data.revenue,
          sessions: data.sessions,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));
    } catch (error) {
      console.error('Error obteniendo ingresos por período:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por zona
   */
  async getZoneStats(
    organizationId: number,
    filters: ReportFilters
  ): Promise<ZoneStats[]> {
    try {
      // Obtener zonas
      const { data: zones, error: zonesError } = await supabase
        .from('parking_zones')
        .select('id, name, capacity, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId);

      if (zonesError) throw zonesError;

      // Obtener sesiones con espacios
      const { data: sessions, error: sessionsError } = await supabase
        .from('parking_sessions')
        .select(`
          amount, duration_min, 
          parking_space:parking_spaces(zone_id),
          branch:branches!inner(organization_id)
        `)
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate)
        .eq('status', 'closed');

      if (sessionsError) throw sessionsError;

      // Agrupar por zona
      const zoneData: { [key: string]: { sessions: number; revenue: number; duration: number } } = {};

      (sessions || []).forEach((session) => {
        const zoneId = session.parking_space?.zone_id || 'sin_zona';
        if (!zoneData[zoneId]) {
          zoneData[zoneId] = { sessions: 0, revenue: 0, duration: 0 };
        }
        zoneData[zoneId].sessions++;
        zoneData[zoneId].revenue += Number(session.amount || 0);
        zoneData[zoneId].duration += Number(session.duration_min || 0);
      });

      return (zones || []).map((zone) => {
        const data = zoneData[zone.id] || { sessions: 0, revenue: 0, duration: 0 };
        return {
          zone_id: zone.id,
          zone_name: zone.name,
          total_sessions: data.sessions,
          total_revenue: data.revenue,
          avg_duration: data.sessions > 0 ? Math.round(data.duration / data.sessions) : 0,
          occupancy_rate: zone.capacity
            ? Math.min(100, Math.round((data.sessions / zone.capacity) * 100))
            : 0,
        };
      });
    } catch (error) {
      console.error('Error obteniendo estadísticas por zona:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por tipo de vehículo
   */
  async getVehicleTypeStats(
    organizationId: number,
    filters: ReportFilters
  ): Promise<VehicleTypeStats[]> {
    try {
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('vehicle_type, amount, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate)
        .eq('status', 'closed');

      if (error) throw error;

      const vehicleData: { [key: string]: { count: number; revenue: number } } = {};
      let total = 0;

      (sessions || []).forEach((session) => {
        const type = session.vehicle_type || 'Otro';
        if (!vehicleData[type]) {
          vehicleData[type] = { count: 0, revenue: 0 };
        }
        vehicleData[type].count++;
        vehicleData[type].revenue += Number(session.amount || 0);
        total++;
      });

      return Object.entries(vehicleData)
        .map(([vehicle_type, data]) => ({
          vehicle_type,
          count: data.count,
          revenue: data.revenue,
          percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
    } catch (error) {
      console.error('Error obteniendo estadísticas por vehículo:', error);
      throw error;
    }
  }

  /**
   * Obtener comparación abonados vs ocasionales
   */
  async getPassVsOccasional(
    organizationId: number,
    filters: ReportFilters
  ): Promise<PassVsOccasional> {
    try {
      // Pagos de sesiones (ocasionales)
      const { data: sessionPayments, error: sessionError } = await supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('source', 'parking_session')
        .gte('created_at', filters.startDate)
        .lte('created_at', filters.endDate)
        .eq('status', 'completed');

      if (sessionError) throw sessionError;

      // Pagos de pases (abonados)
      const { data: passPayments, error: passError } = await supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('source', 'parking_pass')
        .gte('created_at', filters.startDate)
        .lte('created_at', filters.endDate)
        .eq('status', 'completed');

      if (passError) throw passError;

      const occasionalRevenue = (sessionPayments || []).reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );
      const subscriberRevenue = (passPayments || []).reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );

      return {
        subscribers: passPayments?.length || 0,
        occasional: sessionPayments?.length || 0,
        subscriber_revenue: subscriberRevenue,
        occasional_revenue: occasionalRevenue,
      };
    } catch (error) {
      console.error('Error obteniendo comparación abonados vs ocasionales:', error);
      throw error;
    }
  }

  /**
   * Obtener top placas más frecuentes
   */
  async getTopPlates(
    organizationId: number,
    filters: ReportFilters,
    limit: number = 10
  ): Promise<{ plate: string; visits: number; totalSpent: number }[]> {
    try {
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('vehicle_plate, amount, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate);

      if (error) throw error;

      const plateData: { [key: string]: { visits: number; spent: number } } = {};

      (sessions || []).forEach((session) => {
        const plate = session.vehicle_plate;
        if (!plateData[plate]) {
          plateData[plate] = { visits: 0, spent: 0 };
        }
        plateData[plate].visits++;
        plateData[plate].spent += Number(session.amount || 0);
      });

      return Object.entries(plateData)
        .map(([plate, data]) => ({
          plate,
          visits: data.visits,
          totalSpent: data.spent,
        }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, limit);
    } catch (error) {
      console.error('Error obteniendo top placas:', error);
      throw error;
    }
  }

  /**
   * Exportar datos a CSV
   */
  async exportToCSV(
    organizationId: number,
    filters: ReportFilters
  ): Promise<string> {
    try {
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select(`
          vehicle_plate, vehicle_type, entry_at, exit_at, 
          duration_min, amount, status,
          branch:branches!inner(name, organization_id)
        `)
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', filters.startDate)
        .lte('entry_at', filters.endDate)
        .order('entry_at', { ascending: false });

      if (error) throw error;

      const headers = [
        'Placa',
        'Tipo Vehículo',
        'Entrada',
        'Salida',
        'Duración (min)',
        'Monto',
        'Estado',
        'Sucursal',
      ];

      const rows = (sessions || []).map((s) => [
        s.vehicle_plate,
        s.vehicle_type,
        new Date(s.entry_at).toLocaleString('es-CO'),
        s.exit_at ? new Date(s.exit_at).toLocaleString('es-CO') : '-',
        s.duration_min || 0,
        s.amount || 0,
        s.status,
        s.branch?.name || '-',
      ]);

      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } catch (error) {
      console.error('Error exportando datos:', error);
      throw error;
    }
  }
}

const parkingReportService = new ParkingReportService();
export default parkingReportService;
