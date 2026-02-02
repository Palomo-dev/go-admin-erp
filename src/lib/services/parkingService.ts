<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/lib/services/parkingService.ts
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

export interface ParkingVehicle {
  id: string;
  organization_id: number;
  customer_id?: string;
  plate: string;
  brand?: string;
  model?: string;
  color?: string;
  vehicle_type: 'car' | 'motorcycle' | 'truck' | 'other';
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParkingPassVehicle {
  id: string;
  pass_id: string;
  vehicle_id: string;
  is_primary: boolean;
  created_at: string;
  vehicle?: ParkingVehicle;
}

export interface ParkingPass {
  id: string;
  organization_id: number;
  customer_id: string;
  plan_name: string;
  pass_type_id?: string;
  start_date: string;
  end_date: string;
  price: number;
  status: 'active' | 'expired' | 'cancelled' | 'suspended';
  created_at: string;
  updated_at: string;
  pass_type?: ParkingPassType;
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  vehicles?: ParkingPassVehicle[];
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
  status: 'open' | 'closed' | 'cancelled';
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
   * Obtener pases de parking (abonados) con vehículos
   */
  async getPasses(organizationId: number): Promise<ParkingPass[]> {
    try {
      const { data, error } = await supabase
        .from('parking_passes')
        .select(`
          *,
          pass_type:parking_pass_types(*),
          customer:customers(id, full_name, email, phone),
          vehicles:parking_pass_vehicles(
            id,
            pass_id,
            vehicle_id,
            is_primary,
            created_at,
            vehicle:parking_vehicles(*)
          )
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
   * Crear pase de parking con vehículos
   */
  async createPass(data: {
    organization_id: number;
    customer_id: string;
    pass_type_id: string;
    start_date: string;
    end_date: string;
    price: number;
    plan_name: string;
    vehicles: Array<{ plate: string; brand?: string; model?: string; color?: string; vehicle_type?: string; is_primary?: boolean }>;
  }): Promise<ParkingPass> {
    try {
      // 1. Crear el pase
      const { data: pass, error: passError } = await supabase
        .from('parking_passes')
        .insert({
          organization_id: data.organization_id,
          customer_id: data.customer_id,
          pass_type_id: data.pass_type_id,
          start_date: data.start_date,
          end_date: data.end_date,
          price: data.price,
          plan_name: data.plan_name,
          status: 'active',
        })
        .select()
        .single();

      if (passError) throw passError;

      // 2. Crear/obtener vehículos y asociarlos al pase
      for (const vehicleData of data.vehicles) {
        const vehicle = await this.getOrCreateVehicle({
          organization_id: data.organization_id,
          customer_id: data.customer_id,
          plate: vehicleData.plate.toUpperCase().trim(),
          brand: vehicleData.brand,
          model: vehicleData.model,
          color: vehicleData.color,
          vehicle_type: (vehicleData.vehicle_type as any) || 'car',
        });

        // Asociar vehículo al pase
        await supabase.from('parking_pass_vehicles').insert({
          pass_id: pass.id,
          vehicle_id: vehicle.id,
          is_primary: vehicleData.is_primary || false,
        });
      }

      // 3. Retornar pase con relaciones
      return await this.getPassById(pass.id);
    } catch (error) {
      console.error('Error creando pase:', error);
      throw error;
    }
  }

  /**
   * Obtener pase por ID con todas las relaciones
   */
  async getPassById(passId: string): Promise<ParkingPass> {
    const { data, error } = await supabase
      .from('parking_passes')
      .select(`
        *,
        pass_type:parking_pass_types(*),
        customer:customers(id, full_name, email, phone),
        vehicles:parking_pass_vehicles(
          id,
          pass_id,
          vehicle_id,
          is_primary,
          created_at,
          vehicle:parking_vehicles(*)
        )
      `)
      .eq('id', passId)
      .single();

    if (error) throw error;
    return data as ParkingPass;
  }

  /**
   * Obtener o crear vehículo
   */
  async getOrCreateVehicle(data: {
    organization_id: number;
    customer_id?: string;
    plate: string;
    brand?: string;
    model?: string;
    color?: string;
    vehicle_type: string;
  }): Promise<ParkingVehicle> {
    // Buscar vehículo existente por placa
    const { data: existing } = await supabase
      .from('parking_vehicles')
      .select('*')
      .eq('organization_id', data.organization_id)
      .eq('plate', data.plate.toUpperCase())
      .single();

    if (existing) {
      return existing as ParkingVehicle;
    }

    // Crear nuevo vehículo
    const { data: vehicle, error } = await supabase
      .from('parking_vehicles')
      .insert({
        organization_id: data.organization_id,
        customer_id: data.customer_id,
        plate: data.plate.toUpperCase(),
        brand: data.brand,
        model: data.model,
        color: data.color,
        vehicle_type: data.vehicle_type,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return vehicle as ParkingVehicle;
  }

  /**
   * Obtener vehículos de una organización
   */
  async getVehicles(organizationId: number): Promise<ParkingVehicle[]> {
    const { data, error } = await supabase
      .from('parking_vehicles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('plate');

    if (error) throw error;
    return (data || []) as ParkingVehicle[];
  }

  /**
   * Agregar vehículo a un pase existente
   */
  async addVehicleToPass(passId: string, vehicleId: string, isPrimary = false): Promise<void> {
    const { error } = await supabase
      .from('parking_pass_vehicles')
      .insert({
        pass_id: passId,
        vehicle_id: vehicleId,
        is_primary: isPrimary,
      });

    if (error) throw error;
  }

  /**
   * Remover vehículo de un pase
   */
  async removeVehicleFromPass(passId: string, vehicleId: string): Promise<void> {
    const { error } = await supabase
      .from('parking_pass_vehicles')
      .delete()
      .eq('pass_id', passId)
      .eq('vehicle_id', vehicleId);

    if (error) throw error;
  }

  /**
   * Actualizar pase
   */
  async updatePass(id: string, data: Omit<Partial<ParkingPass>, 'vehicles'> & { vehicles?: Array<{ plate: string; brand?: string; model?: string; color?: string; vehicle_type?: string; is_primary?: boolean }> }): Promise<ParkingPass> {
    try {
      // Separar vehículos de los datos del pase
      const { vehicles, ...passData } = data;

      // Actualizar datos del pase
      const { error } = await supabase
        .from('parking_passes')
        .update({ ...passData, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Si se proporcionan vehículos, actualizar la relación
      if (vehicles && vehicles.length > 0) {
        // Obtener el pase actual para obtener organization_id
        const { data: pass } = await supabase
          .from('parking_passes')
          .select('organization_id, customer_id')
          .eq('id', id)
          .single();

        if (pass) {
          // Eliminar vehículos actuales del pase
          await supabase
            .from('parking_pass_vehicles')
            .delete()
            .eq('pass_id', id);

          // Agregar nuevos vehículos
          for (const vehicleData of vehicles) {
            const vehicle = await this.getOrCreateVehicle({
              organization_id: pass.organization_id,
              customer_id: pass.customer_id,
              plate: vehicleData.plate.toUpperCase().trim(),
              brand: vehicleData.brand,
              model: vehicleData.model,
              color: vehicleData.color,
              vehicle_type: vehicleData.vehicle_type || 'car',
            });

            await supabase.from('parking_pass_vehicles').insert({
              pass_id: id,
              vehicle_id: vehicle.id,
              is_primary: vehicleData.is_primary || false,
            });
          }
        }
      }

      return await this.getPassById(id);
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
   * Suspender pase
   */
  async suspendPass(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_passes')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error suspendiendo pase:', error);
      throw error;
    }
  }

  /**
   * Reactivar pase suspendido
   */
  async reactivatePass(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_passes')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error reactivando pase:', error);
      throw error;
    }
  }

  /**
   * Cancelar sesión de parking
   */
  async cancelSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_sessions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error cancelando sesión:', error);
      throw error;
    }
  }

  /**
   * Verificar si una placa tiene pase activo
   */
  async checkPlateHasActivePass(organizationId: number, plate: string): Promise<ParkingPass | null> {
    try {
      const { data, error } = await supabase
        .from('parking_pass_vehicles')
        .select(`
          pass:parking_passes!inner(
            *,
            pass_type:parking_pass_types(*),
            customer:customers(id, full_name, email, phone)
          ),
          vehicle:parking_vehicles!inner(*)
        `)
        .eq('vehicle.plate', plate.toUpperCase())
        .eq('pass.organization_id', organizationId)
        .eq('pass.status', 'active')
        .gte('pass.end_date', new Date().toISOString().split('T')[0])
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error verificando pase:', error);
        return null;
      }

      return (data?.pass as unknown as ParkingPass) || null;
    } catch (error) {
      console.error('Error verificando pase activo:', error);
      return null;
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
=======
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

export interface ParkingVehicle {
  id: string;
  organization_id: number;
  customer_id?: string;
  plate: string;
  brand?: string;
  model?: string;
  color?: string;
  vehicle_type: 'car' | 'motorcycle' | 'truck' | 'other';
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParkingPassVehicle {
  id: string;
  pass_id: string;
  vehicle_id: string;
  is_primary: boolean;
  created_at: string;
  vehicle?: ParkingVehicle;
}

export interface ParkingPass {
  id: string;
  organization_id: number;
  customer_id: string;
  plan_name: string;
  pass_type_id?: string;
  start_date: string;
  end_date: string;
  price: number;
  status: 'active' | 'expired' | 'cancelled' | 'suspended';
  created_at: string;
  updated_at: string;
  pass_type?: ParkingPassType;
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  vehicles?: ParkingPassVehicle[];
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
  status: 'open' | 'closed' | 'cancelled';
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
   * Obtener tipos de pases de parking (solo activos)
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
   * Obtener todos los tipos de pases (incluye inactivos)
   */
  async getAllPassTypes(organizationId: number): Promise<ParkingPassType[]> {
    try {
      const { data, error } = await supabase
        .from('parking_pass_types')
        .select('*')
        .eq('organization_id', organizationId)
        .order('is_active', { ascending: false })
        .order('name');

      if (error) throw error;
      return (data || []) as ParkingPassType[];
    } catch (error) {
      console.error('Error obteniendo todos los tipos de pases:', error);
      throw error;
    }
  }

  /**
   * Obtener un tipo de pase por ID
   */
  async getPassTypeById(id: string): Promise<ParkingPassType | null> {
    try {
      const { data, error } = await supabase
        .from('parking_pass_types')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ParkingPassType;
    } catch (error) {
      console.error('Error obteniendo tipo de pase:', error);
      return null;
    }
  }

  /**
   * Duplicar tipo de pase
   */
  async duplicatePassType(id: string, organizationId: number): Promise<ParkingPassType> {
    try {
      const original = await this.getPassTypeById(id);
      if (!original) throw new Error('Tipo de pase no encontrado');

      const { data, error } = await supabase
        .from('parking_pass_types')
        .insert({
          organization_id: organizationId,
          name: `${original.name} (Copia)`,
          description: original.description,
          duration_days: original.duration_days,
          price: original.price,
          max_entries_per_day: original.max_entries_per_day,
          includes_car_wash: original.includes_car_wash,
          includes_valet: original.includes_valet,
          allowed_vehicle_types: original.allowed_vehicle_types,
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ParkingPassType;
    } catch (error) {
      console.error('Error duplicando tipo de pase:', error);
      throw error;
    }
  }

  /**
   * Toggle estado activo/inactivo de tipo de pase
   */
  async togglePassTypeStatus(id: string): Promise<ParkingPassType> {
    try {
      const current = await this.getPassTypeById(id);
      if (!current) throw new Error('Tipo de pase no encontrado');

      const { data, error } = await supabase
        .from('parking_pass_types')
        .update({ 
          is_active: !current.is_active, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ParkingPassType;
    } catch (error) {
      console.error('Error cambiando estado del tipo de pase:', error);
      throw error;
    }
  }

  /**
   * Contar pases activos por tipo
   */
  async countActivePassesByType(passTypeId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('parking_passes')
        .select('*', { count: 'exact', head: true })
        .eq('pass_type_id', passTypeId)
        .eq('status', 'active');

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error contando pases activos:', error);
      return 0;
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
   * Obtener pases de parking (abonados) con vehículos
   */
  async getPasses(organizationId: number): Promise<ParkingPass[]> {
    try {
      const { data, error } = await supabase
        .from('parking_passes')
        .select(`
          *,
          pass_type:parking_pass_types(*),
          customer:customers(id, full_name, email, phone),
          vehicles:parking_pass_vehicles(
            id,
            pass_id,
            vehicle_id,
            is_primary,
            created_at,
            vehicle:parking_vehicles(*)
          )
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
   * Crear pase de parking con vehículos
   */
  async createPass(data: {
    organization_id: number;
    customer_id: string;
    pass_type_id: string;
    start_date: string;
    end_date: string;
    price: number;
    plan_name: string;
    vehicles: Array<{ plate: string; brand?: string; model?: string; color?: string; vehicle_type?: string; is_primary?: boolean }>;
  }): Promise<ParkingPass> {
    try {
      // 1. Crear el pase
      const { data: pass, error: passError } = await supabase
        .from('parking_passes')
        .insert({
          organization_id: data.organization_id,
          customer_id: data.customer_id,
          pass_type_id: data.pass_type_id,
          start_date: data.start_date,
          end_date: data.end_date,
          price: data.price,
          plan_name: data.plan_name,
          status: 'active',
        })
        .select()
        .single();

      if (passError) throw passError;

      // 2. Crear/obtener vehículos y asociarlos al pase
      for (const vehicleData of data.vehicles) {
        const vehicle = await this.getOrCreateVehicle({
          organization_id: data.organization_id,
          customer_id: data.customer_id,
          plate: vehicleData.plate.toUpperCase().trim(),
          brand: vehicleData.brand,
          model: vehicleData.model,
          color: vehicleData.color,
          vehicle_type: (vehicleData.vehicle_type as any) || 'car',
        });

        // Asociar vehículo al pase
        await supabase.from('parking_pass_vehicles').insert({
          pass_id: pass.id,
          vehicle_id: vehicle.id,
          is_primary: vehicleData.is_primary || false,
        });
      }

      // 3. Retornar pase con relaciones
      return await this.getPassById(pass.id);
    } catch (error) {
      console.error('Error creando pase:', error);
      throw error;
    }
  }

  /**
   * Obtener pase por ID con todas las relaciones
   */
  async getPassById(passId: string): Promise<ParkingPass> {
    const { data, error } = await supabase
      .from('parking_passes')
      .select(`
        *,
        pass_type:parking_pass_types(*),
        customer:customers(id, full_name, email, phone),
        vehicles:parking_pass_vehicles(
          id,
          pass_id,
          vehicle_id,
          is_primary,
          created_at,
          vehicle:parking_vehicles(*)
        )
      `)
      .eq('id', passId)
      .single();

    if (error) throw error;
    return data as ParkingPass;
  }

  /**
   * Obtener o crear vehículo
   */
  async getOrCreateVehicle(data: {
    organization_id: number;
    customer_id?: string;
    plate: string;
    brand?: string;
    model?: string;
    color?: string;
    vehicle_type: string;
  }): Promise<ParkingVehicle> {
    // Buscar vehículo existente por placa
    const { data: existing } = await supabase
      .from('parking_vehicles')
      .select('*')
      .eq('organization_id', data.organization_id)
      .eq('plate', data.plate.toUpperCase())
      .single();

    if (existing) {
      return existing as ParkingVehicle;
    }

    // Crear nuevo vehículo
    const { data: vehicle, error } = await supabase
      .from('parking_vehicles')
      .insert({
        organization_id: data.organization_id,
        customer_id: data.customer_id,
        plate: data.plate.toUpperCase(),
        brand: data.brand,
        model: data.model,
        color: data.color,
        vehicle_type: data.vehicle_type,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return vehicle as ParkingVehicle;
  }

  /**
   * Obtener vehículos de una organización
   */
  async getVehicles(organizationId: number): Promise<ParkingVehicle[]> {
    const { data, error } = await supabase
      .from('parking_vehicles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('plate');

    if (error) throw error;
    return (data || []) as ParkingVehicle[];
  }

  /**
   * Agregar vehículo a un pase existente
   */
  async addVehicleToPass(passId: string, vehicleId: string, isPrimary = false): Promise<void> {
    const { error } = await supabase
      .from('parking_pass_vehicles')
      .insert({
        pass_id: passId,
        vehicle_id: vehicleId,
        is_primary: isPrimary,
      });

    if (error) throw error;
  }

  /**
   * Remover vehículo de un pase
   */
  async removeVehicleFromPass(passId: string, vehicleId: string): Promise<void> {
    const { error } = await supabase
      .from('parking_pass_vehicles')
      .delete()
      .eq('pass_id', passId)
      .eq('vehicle_id', vehicleId);

    if (error) throw error;
  }

  /**
   * Actualizar pase
   */
  async updatePass(id: string, data: Omit<Partial<ParkingPass>, 'vehicles'> & { vehicles?: Array<{ plate: string; brand?: string; model?: string; color?: string; vehicle_type?: string; is_primary?: boolean }> }): Promise<ParkingPass> {
    try {
      // Separar vehículos de los datos del pase
      const { vehicles, ...passData } = data;

      // Actualizar datos del pase
      const { error } = await supabase
        .from('parking_passes')
        .update({ ...passData, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Si se proporcionan vehículos, actualizar la relación
      if (vehicles && vehicles.length > 0) {
        // Obtener el pase actual para obtener organization_id
        const { data: pass } = await supabase
          .from('parking_passes')
          .select('organization_id, customer_id')
          .eq('id', id)
          .single();

        if (pass) {
          // Eliminar vehículos actuales del pase
          await supabase
            .from('parking_pass_vehicles')
            .delete()
            .eq('pass_id', id);

          // Agregar nuevos vehículos
          for (const vehicleData of vehicles) {
            const vehicle = await this.getOrCreateVehicle({
              organization_id: pass.organization_id,
              customer_id: pass.customer_id,
              plate: vehicleData.plate.toUpperCase().trim(),
              brand: vehicleData.brand,
              model: vehicleData.model,
              color: vehicleData.color,
              vehicle_type: vehicleData.vehicle_type || 'car',
            });

            await supabase.from('parking_pass_vehicles').insert({
              pass_id: id,
              vehicle_id: vehicle.id,
              is_primary: vehicleData.is_primary || false,
            });
          }
        }
      }

      return await this.getPassById(id);
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
   * Suspender pase
   */
  async suspendPass(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_passes')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error suspendiendo pase:', error);
      throw error;
    }
  }

  /**
   * Reactivar pase suspendido
   */
  async reactivatePass(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_passes')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error reactivando pase:', error);
      throw error;
    }
  }

  /**
   * Cancelar sesión de parking
   */
  async cancelSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('parking_sessions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error cancelando sesión:', error);
      throw error;
    }
  }

  /**
   * Verificar si una placa tiene pase activo
   */
  async checkPlateHasActivePass(organizationId: number, plate: string): Promise<ParkingPass | null> {
    try {
      const { data, error } = await supabase
        .from('parking_pass_vehicles')
        .select(`
          pass:parking_passes!inner(
            *,
            pass_type:parking_pass_types(*),
            customer:customers(id, full_name, email, phone)
          ),
          vehicle:parking_vehicles!inner(*)
        `)
        .eq('vehicle.plate', plate.toUpperCase())
        .eq('pass.organization_id', organizationId)
        .eq('pass.status', 'active')
        .gte('pass.end_date', new Date().toISOString().split('T')[0])
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error verificando pase:', error);
        return null;
      }

      return (data?.pass as unknown as ParkingPass) || null;
    } catch (error) {
      console.error('Error verificando pase activo:', error);
      return null;
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
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-f372080e/src/lib/services/parkingService.ts
