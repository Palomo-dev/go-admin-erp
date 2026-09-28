import { supabase } from '@/lib/supabase/config';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { toPlainDate } from '@/lib/utils/dateCore';
import { getDateRange } from '@/lib/utils/dateRanges';
import { formatDateTimeInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { diaDeLaSemanaDelDia, sumarDiasAlDia } from '@/lib/services/fiscalCalendar';

// ============================================================
// Fase B, tanda 8 — los reportes de parqueadero se cortan por el dia del
// parqueadero, no por el dia UTC.
//
// `parking_sessions.entry_at` y `payments.created_at` son **timestamptz**
// (verificado en `information_schema.columns`), y las siete consultas de este
// archivo los comparaban contra los dias sueltos del filtro:
//
//     .gte('entry_at', '2026-09-01').lte('entry_at', '2026-09-23')
//
// Postgres lee esas cadenas como medianoche UTC. Dos errores a la vez:
//   1. El ULTIMO DIA DEL RANGO NO ENTRA, salvo la primera hora. Un informe
//      «del 1 al 23» dejaba fuera casi todas las sesiones del 23.
//   2. El corte va desplazado el offset de la zona: en Bogota, las sesiones
//      entre las 19:00 y medianoche se contaban en el dia siguiente.
//
// `getDateRange` convierte los dos extremos en instantes con su offset real
// (DST incluido), y por eso el filtro pasa a ser `gte`/`lte` sobre instantes.
//
// El agrupador por dia/semana/mes y las «horas pico» tambien se leen en la
// zona del parqueadero: `new Date(entry_at).getHours()` daba la hora del
// navegador, y el ISO cortado por la 'T' el dia UTC.
//
// La zona entra por identidad (ADR-003): `resolveTimezone(organizationId,
// filters.branchId)`.
// ============================================================

/**
 * Hora de pared (0–23) de un `timestamptz` en la zona dada, o `null` si el
 * valor no es legible. Nunca `getHours()`, que lee el reloj del navegador.
 */
function horaEnZona(valor: string | null | undefined, timezone: string): number | null {
  if (!valor) return null;
  const instante = new Date(valor);
  if (isNaN(instante.getTime())) return null;
  // `formatTimeInTz` devuelve "HH:mm" en 24 h; `parseInt` se queda con "HH".
  const hora = parseInt(formatTimeInTz(instante, timezone), 10);
  if (isNaN(hora)) return null;
  return hora === 24 ? 0 : hora;
}

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
   * Zona horaria efectiva del reporte. ADR-003: identidad, nunca un
   * `timezone` ya resuelto. `parking_sessions` tiene `branch_id`, asi que
   * cuando el filtro nombra una sucursal manda la suya.
   */
  private zona(organizationId: number, filters: ReportFilters): Promise<string> {
    return resolveTimezone(organizationId, filters.branchId ?? null);
  }

  /**
   * Los dos extremos del filtro como INSTANTES con offset, listos para una
   * columna `timestamptz`. Devuelve tambien la zona, porque quien filtra casi
   * siempre tiene que agrupar o formatear despues con la misma.
   */
  private async rangoDeInstantes(
    organizationId: number,
    filters: ReportFilters,
  ): Promise<{ start: string; end: string; timezone: string }> {
    const timezone = await this.zona(organizationId, filters);
    const { start, end } = getDateRange(filters.startDate, filters.endDate, timezone);
    return { start, end, timezone };
  }

  /**
   * Obtener resumen general de reportes
   */
  async getReportSummary(
    organizationId: number,
    filters: ReportFilters
  ): Promise<ReportSummary> {
    try {
      const rango = await this.rangoDeInstantes(organizationId, filters);
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('*, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end)
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
      const rango = await this.rangoDeInstantes(organizationId, filters);
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('entry_at, duration_min, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end);

      if (error) throw error;

      // Agrupar por hora
      const hourlyData: { [key: number]: { count: number; totalDuration: number } } = {};
      for (let i = 0; i < 24; i++) {
        hourlyData[i] = { count: 0, totalDuration: 0 };
      }

      // La franja horaria es la del PARQUEADERO. `getHours()` daba la del
      // navegador: la misma entrada caia en las 08:00 mirando desde Bogota y
      // en las 15:00 mirando desde Madrid.
      (sessions || []).forEach((session) => {
        const hour = horaEnZona(session.entry_at, rango.timezone);
        if (hour === null) return;
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
      const rango = await this.rangoDeInstantes(organizationId, filters);
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('entry_at, amount, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end)
        .eq('status', 'closed');

      if (error) throw error;

      const periodData: { [key: string]: { revenue: number; sessions: number } } = {};

      (sessions || []).forEach((session) => {
        // `entry_at` es timestamptz: su dia es el de la zona del parqueadero.
        // El ISO cortado por la 'T' daba el dia UTC, y `getFullYear()` /
        // `getMonth()` el mes del navegador: una sesion del 31 de enero a las
        // 20:00 en Bogota se agrupaba en febrero.
        const dia = toPlainDate(new Date(session.entry_at), rango.timezone);
        let periodKey: string;

        if (groupBy === 'day') {
          periodKey = dia;
        } else if (groupBy === 'week') {
          // Semana que empieza en domingo, igual que antes.
          periodKey = sumarDiasAlDia(dia, -diaDeLaSemanaDelDia(dia));
        } else {
          periodKey = dia.slice(0, 7);
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
      const rango = await this.rangoDeInstantes(organizationId, filters);
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
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end)
        .eq('status', 'closed');

      if (sessionsError) throw sessionsError;

      // Agrupar por zona
      const zoneData: { [key: string]: { sessions: number; revenue: number; duration: number } } = {};

      (sessions || []).forEach((session) => {
        const space = session.parking_space as unknown as { zone_id: string } | null;
        const zoneId = space?.zone_id || 'sin_zona';
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
      const rango = await this.rangoDeInstantes(organizationId, filters);
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('vehicle_type, amount, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end)
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
      const rango = await this.rangoDeInstantes(organizationId, filters);
      // Pagos de sesiones (ocasionales)
      const { data: sessionPayments, error: sessionError } = await supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('source', 'parking_session')
        .gte('created_at', rango.start)
        .lte('created_at', rango.end)
        .eq('status', 'completed');

      if (sessionError) throw sessionError;

      // Pagos de pases (abonados)
      const { data: passPayments, error: passError } = await supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('source', 'parking_pass')
        .gte('created_at', rango.start)
        .lte('created_at', rango.end)
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
      const rango = await this.rangoDeInstantes(organizationId, filters);
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select('vehicle_plate, amount, branch:branches!inner(organization_id)')
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end);

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
      const rango = await this.rangoDeInstantes(organizationId, filters);
      const { data: sessions, error } = await supabase
        .from('parking_sessions')
        .select(`
          vehicle_plate, vehicle_type, entry_at, exit_at, 
          duration_min, amount, status,
          branch:branches!inner(name, organization_id)
        `)
        .eq('branch.organization_id', organizationId)
        .gte('entry_at', rango.start)
        .lte('entry_at', rango.end)
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
        // Entrada y salida en la hora del PARQUEADERO. `toLocaleString` sin
        // `timeZone` imprimia la del navegador: el mismo CSV descargado desde
        // dos husos distintos daba horas distintas para la misma sesion.
        formatDateTimeInTz(s.entry_at, rango.timezone),
        s.exit_at ? formatDateTimeInTz(s.exit_at, rango.timezone) : '-',
        s.duration_min || 0,
        s.amount || 0,
        s.status,
        (s.branch as unknown as { name: string } | null)?.name || '-',
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
