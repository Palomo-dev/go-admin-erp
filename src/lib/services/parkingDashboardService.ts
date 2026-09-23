import { supabase } from '@/lib/supabase/config';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { todayInTz } from '@/lib/utils/dateCore';
import { getDayRange } from '@/lib/utils/dateRanges';
import { diasEntreDias, sumarDiasAlDia } from '@/lib/services/fiscalCalendar';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';

// ============================================================
// Fase B, tanda 8 — la caja y la ocupacion del dia son las del parqueadero.
//
// Dos familias de columnas, y el arreglo NO es el mismo (verificado en
// `information_schema.columns`):
//
//   `parking_sessions.created_at` / `.entry_at` / `.exit_at` -> **timestamptz**.
//       Acotar la jornada con `` `${dia}T00:00:00` `` es una cadena SIN offset:
//       Postgres la lee en UTC. En Bogota eso corria el corte cinco horas y la
//       caja del dia se comia las cinco primeras horas de la madrugada
//       siguiente y perdia las cinco ultimas de la tarde. Se usa `getDayRange`,
//       que devuelve los dos extremos con el offset real (DST incluido).
//
//   `parking_passes.start_date` / `.end_date` -> **date**.
//       Aqui basta el dia calendario de la organizacion: `todayInTz`.
//       `parking_passes` NO tiene `branch_id` (comprobado), asi que la zona es
//       la de la organizacion y no la de ninguna sucursal.
//
// La hora de un `timestamptz` tambien es de la zona del parqueadero: las
// «horas pico» salian en la hora del navegador, asi que la misma entrada se
// contaba a las 08:00 desde Bogota y a las 15:00 desde Madrid.
//
// La zona entra por identidad (ADR-003): `resolveTimezone(organizationId,
// branchId)`.
// ============================================================

export interface ParkingDashboardStats {
  // Ocupación
  totalSpaces: number;
  occupiedSpaces: number;
  freeSpaces: number;
  reservedSpaces: number;
  occupancyRate: number;

  // Ingresos
  revenueToday: number;
  revenueSessions: number;
  revenuePasses: number;

  // Sesiones
  activeSessions: number;
  completedToday: number;
  atRiskSessions: number; // Más de X horas

  // Abonados
  totalActivePasses: number;
  expiringIn7Days: number;
  expiringIn15Days: number;
  expiringIn30Days: number;
}

export interface TopPlate {
  vehicle_plate: string;
  visit_count: number;
  last_visit: string;
}

export interface HourlyStats {
  hour: number;
  entries: number;
  exits: number;
}

export interface ActiveSession {
  id: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  duration_minutes: number;
  space_label?: string;
  zone?: string;
  is_at_risk: boolean;
}

export interface ExpiringPass {
  id: string;
  vehicles: Array<{ plate: string; is_primary: boolean }>;
  customer_name: string;
  plan_name: string;
  end_date: string;
  days_remaining: number;
}

class ParkingDashboardService {
  private readonly AT_RISK_THRESHOLD_HOURS = 8; // Sesiones de más de 8 horas se consideran "en riesgo"

  /**
   * Zona horaria efectiva del dato. ADR-003: identidad, nunca un `timezone`
   * ya resuelto. Sin sucursal (vista consolidada) cae en la organizacion.
   */
  private zona(organizationId: number, branchId?: number | null): Promise<string> {
    return resolveTimezone(organizationId, branchId ?? null);
  }

  /**
   * Obtener estadísticas completas del dashboard
   */
  async getDashboardStats(branchId: number | null, organizationId: number): Promise<ParkingDashboardStats> {
    try {
      const tz = await this.zona(organizationId, branchId);
      const today = todayInTz(tz);
      // `created_at` es timestamptz: la jornada se acota con instantes que
      // llevan el offset real de la zona, no con una cadena de dia.
      const jornada = getDayRange(today, tz);
      const now = new Date();

      // Consultas en paralelo para mejor rendimiento
      // Cuando branchId es null, no se filtra por sucursal (datos consolidados)
      const [spacesResult, sessionsResult, passesResult] = await Promise.all([
        // Espacios de parking
        branchId !== null
          ? supabase
              .from('parking_spaces')
              .select('id, state')
              .eq('branch_id', branchId)
          : supabase
              .from('parking_spaces')
              .select('id, state'),

        // Sesiones de hoy
        branchId !== null
          ? supabase
              .from('parking_sessions')
              .select('id, status, entry_at, exit_at, amount')
              .eq('branch_id', branchId)
              .gte('created_at', jornada.start)
              .lte('created_at', jornada.end)
          : supabase
              .from('parking_sessions')
              .select('id, status, entry_at, exit_at, amount')
              .gte('created_at', jornada.start)
              .lte('created_at', jornada.end),

        // Pases activos
        supabase
          .from('parking_passes')
          .select('id, end_date, price, status')
          .eq('organization_id', organizationId)
          .eq('status', 'active'),
      ]);

      // Procesar espacios (manejar errores silenciosamente)
      const spaces = spacesResult.data || [];
      const totalSpaces = spaces.length;
      const occupiedSpaces = spaces.filter((s: any) => s.state === 'occupied').length;
      const freeSpaces = spaces.filter((s: any) => s.state === 'free').length;
      const reservedSpaces = spaces.filter((s: any) => s.state === 'reserved').length;

      // Procesar sesiones
      const sessions = sessionsResult.data || [];
      const activeSessions = sessions.filter((s: any) => s.status === 'open').length;
      const completedToday = sessions.filter((s: any) => s.status === 'closed').length;
      
      // Sesiones "en riesgo" (más de X horas)
      const atRiskThreshold = this.AT_RISK_THRESHOLD_HOURS * 60 * 60 * 1000;
      const atRiskSessions = sessions.filter((s: any) => {
        if (s.status !== 'open') return false;
        const entryTime = new Date(s.entry_at).getTime();
        return (now.getTime() - entryTime) > atRiskThreshold;
      }).length;

      // Ingresos de sesiones de hoy
      const revenueSessions = sessions
        .filter((s: any) => s.status === 'closed' && s.amount)
        .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);

      // Procesar pases
      const passes = passesResult.data || [];
      const totalActivePasses = passes.length;
      
      // Calcular vencimientos
      const expiringIn7Days = passes.filter((p: any) => {
        const daysRemaining = this.getDaysRemaining(p.end_date, today);
        return daysRemaining >= 0 && daysRemaining <= 7;
      }).length;

      const expiringIn15Days = passes.filter((p: any) => {
        const daysRemaining = this.getDaysRemaining(p.end_date, today);
        return daysRemaining > 7 && daysRemaining <= 15;
      }).length;

      const expiringIn30Days = passes.filter((p: any) => {
        const daysRemaining = this.getDaysRemaining(p.end_date, today);
        return daysRemaining > 15 && daysRemaining <= 30;
      }).length;

      // Ingresos de pases activos (mensual)
      const revenuePasses = passes.reduce((sum: number, p: any) => sum + Number(p.price || 0), 0);

      return {
        totalSpaces,
        occupiedSpaces,
        freeSpaces,
        reservedSpaces,
        occupancyRate: totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0,
        revenueToday: revenueSessions,
        revenueSessions,
        revenuePasses,
        activeSessions,
        completedToday,
        atRiskSessions,
        totalActivePasses,
        expiringIn7Days,
        expiringIn15Days,
        expiringIn30Days,
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas del dashboard:', error);
      throw error;
    }
  }

  /**
   * Obtener sesiones activas con información detallada
   */
  async getActiveSessions(branchId: number | null, limit = 20): Promise<ActiveSession[]> {
    try {
      // Cuando branchId es null, no se filtra por sucursal (datos consolidados)
      let query = supabase
        .from('parking_sessions')
        .select(`
          id,
          vehicle_plate,
          vehicle_type,
          entry_at,
          parking_space_id,
          parking_spaces(label, zone)
        `)
        .eq('status', 'open');

      if (branchId !== null) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query
        .order('entry_at', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const now = new Date();
      const atRiskThreshold = this.AT_RISK_THRESHOLD_HOURS * 60;

      return (data || []).map(session => {
        const entryTime = new Date(session.entry_at);
        const durationMinutes = Math.floor((now.getTime() - entryTime.getTime()) / 60000);
        const space = session.parking_spaces as any;

        return {
          id: session.id,
          vehicle_plate: session.vehicle_plate,
          vehicle_type: session.vehicle_type,
          entry_at: session.entry_at,
          duration_minutes: durationMinutes,
          space_label: space?.label,
          zone: space?.zone,
          is_at_risk: durationMinutes > atRiskThreshold,
        };
      });
    } catch (error) {
      console.error('Error obteniendo sesiones activas:', error);
      throw error;
    }
  }

  /**
   * Obtener abonados próximos a vencer
   */
  async getExpiringPasses(organizationId: number, daysAhead = 30): Promise<ExpiringPass[]> {
    try {
      // `parking_passes` no tiene `branch_id`: la zona es la de la organizacion.
      const tz = await this.zona(organizationId);
      const today = todayInTz(tz);
      const futureDate = sumarDiasAlDia(today, daysAhead);

      const { data, error } = await supabase
        .from('parking_passes')
        .select(`
          id,
          plan_name,
          end_date,
          customers(full_name),
          vehicles:parking_pass_vehicles(
            is_primary,
            vehicle:parking_vehicles(plate)
          )
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .gte('end_date', today)
        .lte('end_date', futureDate)
        .order('end_date', { ascending: true });

      if (error) {
        console.error('Error en query parking_passes:', error);
        return [];
      }

      return (data || []).map(pass => ({
        id: pass.id,
        vehicles: ((pass as any).vehicles || []).map((v: any) => ({
          plate: v.vehicle?.plate || '',
          is_primary: v.is_primary,
        })),
        customer_name: (pass.customers as any)?.full_name || 'Sin nombre',
        plan_name: pass.plan_name,
        end_date: pass.end_date,
        days_remaining: this.getDaysRemaining(pass.end_date, today),
      }));
    } catch (error) {
      console.error('Error obteniendo pases por vencer:', error);
      return [];
    }
  }

  /**
   * Obtener placas más frecuentes
   */
  async getTopPlates(branchId: number, limit = 10): Promise<TopPlate[]> {
    try {
      // Usamos una consulta para agrupar por placa
      const { data, error } = await supabase
        .from('parking_sessions')
        .select('vehicle_plate, entry_at')
        .eq('branch_id', branchId)
        .order('entry_at', { ascending: false });

      if (error) throw error;

      // Agrupar y contar en el cliente
      const plateMap = new Map<string, { count: number; lastVisit: string }>();
      
      (data || []).forEach(session => {
        const existing = plateMap.get(session.vehicle_plate);
        if (existing) {
          existing.count++;
        } else {
          plateMap.set(session.vehicle_plate, {
            count: 1,
            lastVisit: session.entry_at,
          });
        }
      });

      // Convertir a array y ordenar
      return Array.from(plateMap.entries())
        .map(([plate, data]) => ({
          vehicle_plate: plate,
          visit_count: data.count,
          last_visit: data.lastVisit,
        }))
        .sort((a, b) => b.visit_count - a.visit_count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error obteniendo top placas:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por hora (horas pico)
   */
  async getHourlyStats(branchId: number, organizationId: number, date?: string): Promise<HourlyStats[]> {
    try {
      const tz = await this.zona(organizationId, branchId);
      const targetDate = date || todayInTz(tz);
      // `entry_at` es timestamptz. El corte anterior ademas se quedaba en
      // `23:59:59`, o sea perdia el ultimo segundo del dia; `getDayRange`
      // llega hasta `23:59:59.999` con el offset correcto.
      const jornada = getDayRange(targetDate, tz);

      const { data, error } = await supabase
        .from('parking_sessions')
        .select('entry_at, exit_at')
        .eq('branch_id', branchId)
        .gte('entry_at', jornada.start)
        .lte('entry_at', jornada.end);

      if (error) throw error;

      // Inicializar array de 24 horas
      const hourlyData: HourlyStats[] = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        entries: 0,
        exits: 0,
      }));

      // Contar entradas y salidas por hora DE LA ZONA DEL PARQUEADERO.
      // `getHours()` daba la hora del navegador: las mismas entradas salian
      // en franjas distintas segun desde donde se mirara el tablero.
      (data || []).forEach(session => {
        const entryHour = this.horaEnZona(session.entry_at, tz);
        if (entryHour !== null) hourlyData[entryHour].entries++;

        if (session.exit_at) {
          const exitHour = this.horaEnZona(session.exit_at, tz);
          if (exitHour !== null) hourlyData[exitHour].exits++;
        }
      });

      return hourlyData;
    } catch (error) {
      console.error('Error obteniendo estadísticas por hora:', error);
      throw error;
    }
  }

  /**
   * Obtener ocupación por zona
   */
  async getOccupancyByZone(branchId: number): Promise<Array<{
    zone_name: string;
    total: number;
    occupied: number;
    free: number;
    occupancy_rate: number;
  }>> {
    try {
      const { data, error } = await supabase
        .from('parking_spaces')
        .select(`
          id,
          state,
          zone,
          parking_zones(name)
        `)
        .eq('branch_id', branchId);

      if (error) throw error;

      // Agrupar por zona
      const zoneMap = new Map<string, { total: number; occupied: number; free: number }>();

      (data || []).forEach(space => {
        const zoneName = (space.parking_zones as any)?.name || space.zone || 'Sin zona';
        const existing = zoneMap.get(zoneName) || { total: 0, occupied: 0, free: 0 };
        
        existing.total++;
        if (space.state === 'occupied') existing.occupied++;
        if (space.state === 'free') existing.free++;
        
        zoneMap.set(zoneName, existing);
      });

      return Array.from(zoneMap.entries()).map(([name, stats]) => ({
        zone_name: name,
        total: stats.total,
        occupied: stats.occupied,
        free: stats.free,
        occupancy_rate: stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0,
      }));
    } catch (error) {
      console.error('Error obteniendo ocupación por zona:', error);
      throw error;
    }
  }

  /**
   * Exportar resumen diario
   */
  async getDailySummary(branchId: number, organizationId: number, date?: string): Promise<{
    date: string;
    stats: ParkingDashboardStats;
    topPlates: TopPlate[];
    hourlyStats: HourlyStats[];
  }> {
    const targetDate = date || todayInTz(await this.zona(organizationId, branchId));

    const [stats, topPlates, hourlyStats] = await Promise.all([
      this.getDashboardStats(branchId, organizationId),
      this.getTopPlates(branchId, 5),
      this.getHourlyStats(branchId, organizationId, targetDate),
    ]);

    return {
      date: targetDate,
      stats,
      topPlates,
      hourlyStats,
    };
  }

  // Helpers

  /**
   * Hora de pared (0–23) de un `timestamptz` en la zona dada, o `null` si el
   * valor no es legible. Nunca `getHours()`, que lee el reloj del navegador.
   */
  private horaEnZona(valor: string | null | undefined, timezone: string): number | null {
    if (!valor) return null;
    const instante = new Date(valor);
    if (isNaN(instante.getTime())) return null;
    // `formatTimeInTz` devuelve "HH:mm" en 24 h; `parseInt` se queda con "HH".
    const hora = parseInt(formatTimeInTz(instante, timezone), 10);
    if (isNaN(hora)) return null;
    return hora === 24 ? 0 : hora;
  }

  /**
   * Dias que le quedan a un pase, contados en DIAS CALENDARIO desde el dia de
   * la organizacion (`hoy`, `YYYY-MM-DD`), no en bloques de 24 h desde el
   * reloj del navegador.
   *
   * `parking_passes.end_date` es una columna **date**, asi que aqui no hay
   * instantes que convertir: es una resta de dias. Lo anterior (`new Date()`
   * con `setHours(0,0,0,0)`) daba la medianoche del NAVEGADOR: desde Madrid,
   * el pase de un parqueadero de Bogota vencia un dia antes en pantalla.
   */
  private getDaysRemaining(endDate: string, hoy: string): number {
    return diasEntreDias(hoy, endDate.slice(0, 10));
  }
}

export default new ParkingDashboardService();
