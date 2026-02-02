import { supabase } from '@/lib/supabase/config';

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
   * Obtener estadísticas completas del dashboard
   */
  async getDashboardStats(branchId: number, organizationId: number): Promise<ParkingDashboardStats> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();

      // Consultas en paralelo para mejor rendimiento
      const [spacesResult, sessionsResult, passesResult] = await Promise.all([
        // Espacios de parking
        supabase
          .from('parking_spaces')
          .select('id, state')
          .eq('branch_id', branchId),

        // Sesiones de hoy
        supabase
          .from('parking_sessions')
          .select('id, status, entry_at, exit_at, amount')
          .eq('branch_id', branchId)
          .gte('created_at', `${today}T00:00:00`),

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
        const daysRemaining = this.getDaysRemaining(p.end_date);
        return daysRemaining >= 0 && daysRemaining <= 7;
      }).length;

      const expiringIn15Days = passes.filter((p: any) => {
        const daysRemaining = this.getDaysRemaining(p.end_date);
        return daysRemaining > 7 && daysRemaining <= 15;
      }).length;

      const expiringIn30Days = passes.filter((p: any) => {
        const daysRemaining = this.getDaysRemaining(p.end_date);
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
  async getActiveSessions(branchId: number, limit = 20): Promise<ActiveSession[]> {
    try {
      const { data, error } = await supabase
        .from('parking_sessions')
        .select(`
          id,
          vehicle_plate,
          vehicle_type,
          entry_at,
          parking_space_id,
          parking_spaces(label, zone)
        `)
        .eq('branch_id', branchId)
        .eq('status', 'open')
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
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

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
        .gte('end_date', today.toISOString().split('T')[0])
        .lte('end_date', futureDate.toISOString().split('T')[0])
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
        days_remaining: this.getDaysRemaining(pass.end_date),
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
  async getHourlyStats(branchId: number, date?: string): Promise<HourlyStats[]> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('parking_sessions')
        .select('entry_at, exit_at')
        .eq('branch_id', branchId)
        .gte('entry_at', `${targetDate}T00:00:00`)
        .lt('entry_at', `${targetDate}T23:59:59`);

      if (error) throw error;

      // Inicializar array de 24 horas
      const hourlyData: HourlyStats[] = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        entries: 0,
        exits: 0,
      }));

      // Contar entradas y salidas por hora
      (data || []).forEach(session => {
        const entryHour = new Date(session.entry_at).getHours();
        hourlyData[entryHour].entries++;

        if (session.exit_at) {
          const exitHour = new Date(session.exit_at).getHours();
          hourlyData[exitHour].exits++;
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
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const [stats, topPlates, hourlyStats] = await Promise.all([
      this.getDashboardStats(branchId, organizationId),
      this.getTopPlates(branchId, 5),
      this.getHourlyStats(branchId, targetDate),
    ]);

    return {
      date: targetDate,
      stats,
      topPlates,
      hourlyStats,
    };
  }

  // Helpers
  private getDaysRemaining(endDate: string): number {
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
}

export default new ParkingDashboardService();
