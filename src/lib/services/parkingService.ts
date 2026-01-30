import { supabase } from '@/lib/supabase/config';

export interface ParkingZone {
  id: string;
  branch_id: number;
  name: string;
  description?: string;
  capacity: number;
  rate_multiplier: number;
  is_covered: boolean;
  is_vip: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParkingPassType {
  id: string;
  organization_id: number;
  name: string;
  description?: string;
  duration_days: number;
  price: number;
  max_entries_per_day?: number;
  includes_car_wash: boolean;
  includes_valet: boolean;
  allowed_vehicle_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParkingPass {
  id: string;
  organization_id: number;
  customer_id: string;
  vehicle_plate: string;
  plan_name: string;
  pass_type_id?: string;
  start_date: string;
  end_date: string;
  price: number;
  status: 'active' | 'expired' | 'cancelled';
  created_at: string;
  updated_at: string;
  pass_type?: ParkingPassType;
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
}

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

  // ==================== ZONAS ====================

  /**
   * Obtener zonas de parking
   */
  async getZones(branchId: number): Promise<ParkingZone[]> {
    try {
      const { data, error } = await supabase
        .from('parking_zones')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data || []) as ParkingZone[];
    } catch (error) {
      console.error('Error obteniendo zonas:', error);
      throw error;
    }
  }

  /**
   * Crear zona de parking
   */
  async createZone(data: Partial<ParkingZone>): Promise<ParkingZone> {
    try {
      const { data: zone, error } = await supabase
        .from('parking_zones')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return zone as ParkingZone;
    } catch (error) {
      console.error('Error creando zona:', error);
      throw error;
    }
  }

  // ==================== TIPOS DE PASES ====================

  /**
   * Obtener tipos de pases de parking
   */
  async getPassTypes(organizationId: number): Promise<ParkingPassType[]> {
    try {
      const { data, error } = await supabase
        .from('parking_pass_types')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data || []) as ParkingPassType[];
    } catch (error) {
      console.error('Error obteniendo tipos de pases:', error);
      throw error;
    }
  }

  /**
   * Crear tipo de pase
   */
  async createPassType(data: Partial<ParkingPassType>): Promise<ParkingPassType> {
    try {
      const { data: passType, error } = await supabase
        .from('parking_pass_types')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return passType as ParkingPassType;
    } catch (error) {
      console.error('Error creando tipo de pase:', error);
      throw error;
    }
  }

  /**
   * Actualizar tipo de pase
   */
  async updatePassType(id: string, data: Partial<ParkingPassType>): Promise<ParkingPassType> {
    try {
      const { data: passType, error } = await supabase
        .from('parking_pass_types')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return passType as ParkingPassType;
    } catch (error) {
      console.error('Error actualizando tipo de pase:', error);
      throw error;
    }
  }

  /**
   * Eliminar tipo de pase (soft delete)
   */
  async deletePassType(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_pass_types')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando tipo de pase:', error);
      throw error;
    }
  }

  // ==================== PASES/ABONADOS ====================

  /**
   * Obtener pases de parking (abonados)
   */
  async getPasses(organizationId: number): Promise<ParkingPass[]> {
    try {
      const { data, error } = await supabase
        .from('parking_passes')
        .select(`
          *,
          pass_type:parking_pass_types(*),
          customer:customers(id, full_name, email, phone)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ParkingPass[];
    } catch (error) {
      console.error('Error obteniendo pases:', error);
      throw error;
    }
  }

  /**
   * Crear pase de parking
   */
  async createPass(data: {
    organization_id: number;
    customer_id: string;
    vehicle_plate: string;
    pass_type_id: string;
    start_date: string;
    end_date: string;
    price: number;
    plan_name: string;
  }): Promise<ParkingPass> {
    try {
      const { data: pass, error } = await supabase
        .from('parking_passes')
        .insert({
          ...data,
          status: 'active',
        })
        .select(`
          *,
          pass_type:parking_pass_types(*),
          customer:customers(id, full_name, email, phone)
        `)
        .single();

      if (error) throw error;
      return pass as ParkingPass;
    } catch (error) {
      console.error('Error creando pase:', error);
      throw error;
    }
  }

  /**
   * Actualizar pase
   */
  async updatePass(id: string, data: Partial<ParkingPass>): Promise<ParkingPass> {
    try {
      const { data: pass, error } = await supabase
        .from('parking_passes')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(`
          *,
          pass_type:parking_pass_types(*),
          customer:customers(id, full_name, email, phone)
        `)
        .single();

      if (error) throw error;
      return pass as ParkingPass;
    } catch (error) {
      console.error('Error actualizando pase:', error);
      throw error;
    }
  }

  /**
   * Cancelar pase
   */
  async cancelPass(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_passes')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error cancelando pase:', error);
      throw error;
    }
  }

  /**
   * Buscar clientes para asignar pase
   */
  async searchCustomers(organizationId: number, query: string): Promise<Array<{
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, phone')
        .eq('organization_id', organizationId)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error buscando clientes:', error);
      throw error;
    }
  }
}

export default new ParkingService();
