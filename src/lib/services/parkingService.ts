import { supabase } from '@/lib/supabase/config';

export interface ParkingSession {
  id: string;
  branch_id: number;
  parking_space_id?: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  exit_at?: string;
  duration_min?: number;
  rate_id?: string;
  amount?: number;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface ParkingStats {
  total_sessions: number;
  active_sessions: number;
  completed_today: number;
  revenue_today: number;
}

class ParkingService {
  /**
   * Obtener sesiones de parking
   */
  async getSessions(branchId?: number, organizationId?: number): Promise<ParkingSession[]> {
    try {
      let query = supabase
        .from('parking_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error de Supabase en getSessions:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Error obteniendo sesiones: ${error.message}`);
      }
      return (data || []) as ParkingSession[];
    } catch (error: any) {
      console.error('Error obteniendo sesiones:', error.message || error);
      throw error;
    }
  }

  /**
   * Crear sesión de entrada
   */
  async createEntry(
    data: {
      branch_id: number;
      vehicle_plate: string;
      vehicle_type: string;
      parking_space_id?: string;
    },
    organizationId?: number
  ): Promise<ParkingSession> {
    try {
      const { data: session, error } = await supabase
        .from('parking_sessions')
        .insert({
          ...data,
          entry_at: new Date().toISOString(),
          status: 'open',
        })
        .select()
        .single();

      if (error) {
        console.error('Error de Supabase en createEntry:', error);
        throw error;
      }
      return session as ParkingSession;
    } catch (error) {
      console.error('Error creando entrada:', error);
      throw error;
    }
  }

  /**
   * Registrar salida
   */
  async registerExit(sessionId: string, amount: number): Promise<ParkingSession> {
    try {
      const exitTime = new Date().toISOString();
      
      // Obtener sesión
      const { data: session } = await supabase
        .from('parking_sessions')
        .select('entry_at')
        .eq('id', sessionId)
        .single();

      // Calcular duración
      const duration = session 
        ? Math.floor((new Date(exitTime).getTime() - new Date(session.entry_at).getTime()) / 60000)
        : 0;

      const { data, error } = await supabase
        .from('parking_sessions')
        .update({
          exit_at: exitTime,
          duration_min: duration,
          amount,
          status: 'closed',
          updated_at: exitTime,
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as ParkingSession;
    } catch (error) {
      console.error('Error registrando salida:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas
   */
  async getStats(branchId?: number, organizationId?: number): Promise<ParkingStats> {
    try {
      let query = supabase
        .from('parking_sessions')
        .select('*');
      
      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error de Supabase en getStats:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Error obteniendo estadísticas: ${error.message}`);
      }

      const today = new Date().toISOString().split('T')[0];
      
      return {
        total_sessions: data?.length || 0,
        active_sessions: data?.filter(s => s.status === 'open').length || 0,
        completed_today: data?.filter(s => 
          s.status === 'closed' && 
          s.exit_at?.startsWith(today)
        ).length || 0,
        revenue_today: data?.filter(s => 
          s.status === 'closed' && 
          s.exit_at?.startsWith(today)
        ).reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0,
      };
    } catch (error: any) {
      console.error('Error obteniendo estadísticas:', error.message || error);
      throw error;
    }
  }
}

export default new ParkingService();
