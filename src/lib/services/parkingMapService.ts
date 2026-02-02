import { supabase } from '@/lib/supabase/config';

export type SpaceState = 'free' | 'occupied' | 'reserved' | 'maintenance';
export type SpaceType = 'car' | 'motorcycle' | 'bicycle' | 'disabled' | 'vip';

export interface ParkingSpace {
  id: string;
  branch_id: number;
  label: string;
  zone?: string;
  zone_id?: string;
  type: SpaceType;
  state: SpaceState;
  created_at: string;
  updated_at: string;
  // Relación con sesión activa
  active_session?: {
    id: string;
    vehicle_plate: string;
    vehicle_type: string;
    entry_at: string;
  };
  // Relación con zona
  parking_zone?: {
    id: string;
    name: string;
    is_covered: boolean;
    is_vip: boolean;
  };
}

export interface ParkingZone {
  id: string;
  branch_id: number;
  name: string;
  description?: string;
  capacity?: number;
  is_covered: boolean;
  is_vip: boolean;
  is_active: boolean;
}

export interface MapStats {
  total: number;
  free: number;
  occupied: number;
  reserved: number;
  maintenance: number;
  occupancy_rate: number;
}

export interface AssignSpaceData {
  space_id: string;
  vehicle_plate: string;
  vehicle_type: string;
  branch_id: number;
}

class ParkingMapService {
  /**
   * Obtener todos los espacios de una sucursal con sus sesiones activas
   */
  async getSpaces(branchId: number): Promise<ParkingSpace[]> {
    try {
      const { data: spaces, error } = await supabase
        .from('parking_spaces')
        .select(`
          *,
          parking_zone:parking_zones(id, name, is_covered, is_vip)
        `)
        .eq('branch_id', branchId)
        .order('label');

      if (error) throw error;

      // Obtener sesiones activas para los espacios
      const { data: sessions } = await supabase
        .from('parking_sessions')
        .select('id, parking_space_id, vehicle_plate, vehicle_type, entry_at')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .not('parking_space_id', 'is', null);

      // Mapear sesiones a espacios
      const sessionMap = new Map(
        (sessions || []).map((s) => [s.parking_space_id, s])
      );

      return (spaces || []).map((space) => ({
        ...space,
        active_session: sessionMap.get(space.id) || undefined,
      }));
    } catch (error) {
      console.error('Error obteniendo espacios:', error);
      throw error;
    }
  }

  /**
   * Obtener zonas de una sucursal
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
      return data || [];
    } catch (error) {
      console.error('Error obteniendo zonas:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del mapa
   */
  async getMapStats(branchId: number): Promise<MapStats> {
    try {
      const { data: spaces, error } = await supabase
        .from('parking_spaces')
        .select('state')
        .eq('branch_id', branchId);

      if (error) throw error;

      const spacesList = spaces || [];
      const total = spacesList.length;
      const free = spacesList.filter((s) => s.state === 'free').length;
      const occupied = spacesList.filter((s) => s.state === 'occupied').length;
      const reserved = spacesList.filter((s) => s.state === 'reserved').length;
      const maintenance = spacesList.filter((s) => s.state === 'maintenance').length;

      return {
        total,
        free,
        occupied,
        reserved,
        maintenance,
        occupancy_rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado de un espacio
   */
  async updateSpaceState(spaceId: string, newState: SpaceState): Promise<ParkingSpace> {
    try {
      const { data, error } = await supabase
        .from('parking_spaces')
        .update({ state: newState, updated_at: new Date().toISOString() })
        .eq('id', spaceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando estado:', error);
      throw error;
    }
  }

  /**
   * Asignar espacio a una sesión (crear sesión con espacio asignado)
   */
  async assignSpaceToSession(data: AssignSpaceData): Promise<void> {
    try {
      // Crear sesión con el espacio asignado
      const { error: sessionError } = await supabase.from('parking_sessions').insert({
        branch_id: data.branch_id,
        parking_space_id: data.space_id,
        vehicle_plate: data.vehicle_plate.toUpperCase(),
        vehicle_type: data.vehicle_type,
        entry_at: new Date().toISOString(),
        status: 'open',
      });

      if (sessionError) throw sessionError;

      // Actualizar estado del espacio a ocupado
      const { error: spaceError } = await supabase
        .from('parking_spaces')
        .update({ state: 'occupied', updated_at: new Date().toISOString() })
        .eq('id', data.space_id);

      if (spaceError) throw spaceError;
    } catch (error) {
      console.error('Error asignando espacio:', error);
      throw error;
    }
  }

  /**
   * Liberar espacio (cerrar sesión y liberar espacio)
   */
  async releaseSpace(spaceId: string, sessionId: string): Promise<void> {
    try {
      // Cerrar sesión
      const { error: sessionError } = await supabase
        .from('parking_sessions')
        .update({
          exit_at: new Date().toISOString(),
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (sessionError) throw sessionError;

      // Liberar espacio
      const { error: spaceError } = await supabase
        .from('parking_spaces')
        .update({ state: 'free', updated_at: new Date().toISOString() })
        .eq('id', spaceId);

      if (spaceError) throw spaceError;
    } catch (error) {
      console.error('Error liberando espacio:', error);
      throw error;
    }
  }

  /**
   * Suscribirse a cambios en tiempo real
   */
  subscribeToChanges(
    branchId: number,
    onSpaceChange: (space: ParkingSpace) => void,
    onSessionChange: () => void
  ) {
    // Suscripción a cambios en espacios
    const spacesChannel = supabase
      .channel(`parking_spaces_${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parking_spaces',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          if (payload.new) {
            onSpaceChange(payload.new as ParkingSpace);
          }
        }
      )
      .subscribe();

    // Suscripción a cambios en sesiones
    const sessionsChannel = supabase
      .channel(`parking_sessions_${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parking_sessions',
          filter: `branch_id=eq.${branchId}`,
        },
        () => {
          onSessionChange();
        }
      )
      .subscribe();

    // Retornar función para desuscribirse
    return () => {
      supabase.removeChannel(spacesChannel);
      supabase.removeChannel(sessionsChannel);
    };
  }
}

const parkingMapService = new ParkingMapService();
export default parkingMapService;
