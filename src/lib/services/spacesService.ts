import { supabase } from '@/lib/supabase/config';

export type SpaceStatus = 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning' | 'out_of_order';

export interface SpaceCategory {
  code: string;
  display_name: string;
  icon: string | null;
  is_bookable: boolean;
  requires_checkin: boolean;
  sort_order: number;
}

export interface SpaceType {
  id: string;
  organization_id: number;
  name: string;
  short_name: string | null;
  category_code: string;
  capacity: number;
  area_sqm: number | null;
  base_rate: number;
  amenities: Record<string, any>;
  is_active: boolean;
  category?: SpaceCategory;
}

export interface Space {
  id: string;
  branch_id: number;
  space_type_id: string;
  label: string;
  floor_zone: string | null;
  status: SpaceStatus;
  location_details: Record<string, any>;
  maintenance_notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  space_types?: SpaceType;
}

export interface CreateSpaceData {
  branch_id: number;
  space_type_id: string;
  label: string;
  floor_zone?: string;
  status?: SpaceStatus;
}

export interface UpdateSpaceData {
  label?: string;
  floor_zone?: string;
  status?: SpaceStatus;
  maintenance_notes?: string;
}

class SpacesService {
  /**
   * Obtener todos los espacios con sus tipos y categorías
   */
  async getSpaces(filters?: {
    branchId?: number;
    status?: SpaceStatus | 'all';
    floorZone?: string;
  }) {
    try {
      let query = supabase
        .from('spaces')
        .select(`
          *,
          space_types (
            *,
            category:space_categories!space_types_category_code_fkey (*)
          )
        `)
        .order('label', { ascending: true });

      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.floorZone) {
        query = query.eq('floor_zone', filters.floorZone);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Space[];
    } catch (error) {
      console.error('Error obteniendo espacios:', error);
      throw error;
    }
  }

  /**
   * Obtener un espacio por ID con todas sus relaciones
   */
  async getSpace(id: string) {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select(`
          *,
          space_types (
            *,
            category:space_categories!space_types_category_code_fkey (*)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Space;
    } catch (error) {
      console.error('Error obteniendo espacio:', error);
      throw error;
    }
  }

  /**
   * Obtener reservas de un espacio
   */
  async getSpaceReservations(spaceId: string) {
    try {
      // Primero obtener los IDs de reservas desde reservation_spaces
      const { data: reservationSpaces, error: rsError } = await supabase
        .from('reservation_spaces')
        .select('reservation_id')
        .eq('space_id', spaceId);

      if (rsError) throw rsError;
      if (!reservationSpaces || reservationSpaces.length === 0) return [];

      const reservationIds = reservationSpaces.map(rs => rs.reservation_id);

      // Luego obtener las reservas completas con información del cliente
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id,
          checkin,
          checkout,
          status,
          occupant_count,
          total_estimated,
          notes,
          customer:customers (
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .in('id', reservationIds)
        .order('checkin', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error obteniendo reservas:', error);
        throw error;
      }
      return data || [];
    } catch (error) {
      console.error('Error obteniendo reservas:', error);
      throw error;
    }
  }

  /**
   * Obtener tareas de limpieza de un espacio
   */
  async getSpaceHousekeepingTasks(spaceId: string) {
    try {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('*')
        .eq('space_id', spaceId)
        .order('task_date', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo tareas de limpieza:', error);
      throw error;
    }
  }

  /**
   * Obtener órdenes de mantenimiento de un espacio
   */
  async getSpaceMaintenanceOrders(spaceId: string) {
    try {
      const { data, error } = await supabase
        .from('maintenance_orders')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // Retornar array vacío silenciosamente si hay error
        // (puede ser RLS o tabla sin datos)
        return [];
      }
      return data || [];
    } catch (error) {
      // Retornar array vacío silenciosamente en caso de error
      return [];
    }
  }

  /**
   * Crear orden de mantenimiento
   */
  async createMaintenanceOrder(data: {
    space_id: string;
    branch_id: number;
    description: string;
    priority: 'low' | 'med' | 'high';
    reported_by?: string;
  }) {
    try {
      const { data: order, error } = await supabase
        .from('maintenance_orders')
        .insert({
          ...data,
          status: 'reported',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando orden de mantenimiento:', error);
        throw error;
      }
      return order;
    } catch (error) {
      console.error('Error creando orden de mantenimiento:', error);
      throw error;
    }
  }

  /**
   * Crear tarea de limpieza
   */
  async createHousekeepingTask(data: {
    space_id: string;
    task_date: string;
    notes?: string;
  }) {
    try {
      const { data: task, error } = await supabase
        .from('housekeeping_tasks')
        .insert({
          ...data,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando tarea de limpieza:', error);
        throw error;
      }
      return task;
    } catch (error) {
      console.error('Error creando tarea de limpieza:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado de tarea de limpieza
   */
  async updateHousekeepingTaskStatus(taskId: string, status: string) {
    try {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select('id, space_id, status')
        .single();

      if (error) {
        console.error('Error actualizando estado de limpieza:', error);
        throw error;
      }

      // Si la tarea se marca como completada, actualizar el espacio a 'available'
      if (status === 'done' && data.space_id) {
        const { error: spaceError } = await supabase
          .from('spaces')
          .update({ 
            status: 'available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.space_id);

        if (spaceError) {
          console.error('Error actualizando estado del espacio:', spaceError);
          // No lanzar error para no bloquear la actualización de la tarea
        }
      }

      return data;
    } catch (error) {
      console.error('Error actualizando estado de limpieza:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado de orden de mantenimiento
   */
  async updateMaintenanceOrderStatus(orderId: string, status: string) {
    try {
      const updateData: any = { 
        status,
        updated_at: new Date().toISOString(),
      };

      // Si se completa, agregar resolved_at
      if (status === 'completed') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('maintenance_orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando orden de mantenimiento:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo espacio
   */
  async createSpace(data: CreateSpaceData) {
    try {
      const { data: space, error } = await supabase
        .from('spaces')
        .insert({
          ...data,
          status: data.status || 'available',
        })
        .select()
        .single();

      if (error) throw error;
      return space as Space;
    } catch (error) {
      console.error('Error creando espacio:', error);
      throw error;
    }
  }

  /**
   * Actualizar un espacio
   */
  async updateSpace(id: string, data: UpdateSpaceData) {
    try {
      const { data: space, error } = await supabase
        .from('spaces')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return space as Space;
    } catch (error) {
      console.error('Error actualizando espacio:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado de múltiples espacios
   */
  async updateMultipleSpaces(ids: string[], data: UpdateSpaceData) {
    try {
      const { data: spaces, error } = await supabase
        .from('spaces')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .in('id', ids)
        .select();

      if (error) throw error;
      return spaces as Space[];
    } catch (error) {
      console.error('Error actualizando espacios:', error);
      throw error;
    }
  }

  /**
   * Eliminar un espacio
   */
  async deleteSpace(id: string) {
    try {
      const { error } = await supabase
        .from('spaces')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando espacio:', error);
      throw error;
    }
  }

  /**
   * Obtener tipos de espacio
   */
  async getSpaceTypes(organizationId: number) {
    try {
      const { data, error } = await supabase
        .from('space_types')
        .select(`
          *,
          category:space_categories!space_types_category_code_fkey (*)
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as SpaceType[];
    } catch (error) {
      console.error('Error obteniendo tipos de espacio:', error);
      throw error;
    }
  }

  /**
   * Obtener categorías de espacio
   */
  async getSpaceCategories() {
    try {
      const { data, error } = await supabase
        .from('space_categories')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      return data as SpaceCategory[];
    } catch (error) {
      console.error('Error obteniendo categorías:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo tipo de espacio
   */
  async createSpaceType(data: {
    organization_id: number;
    name: string;
    short_name?: string;
    category_code: string;
    capacity: number;
    base_rate: number;
  }) {
    try {
      const { data: spaceType, error } = await supabase
        .from('space_types')
        .insert({
          ...data,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return spaceType as SpaceType;
    } catch (error) {
      console.error('Error creando tipo de espacio:', error);
      throw error;
    }
  }

  /**
   * Obtener zonas únicas
   */
  async getFloorZones(branchId: number) {
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('floor_zone')
        .eq('branch_id', branchId)
        .not('floor_zone', 'is', null);

      if (error) throw error;

      const zones = Array.from(
        new Set(data.map((d) => d.floor_zone).filter(Boolean))
      ).sort();

      return zones as string[];
    } catch (error) {
      console.error('Error obteniendo zonas:', error);
      throw error;
    }
  }

  /**
   * Exportar espacios a CSV
   */
  exportToCSV(spaces: Space[]) {
    const headers = ['Categoría', 'Tipo', 'Etiqueta', 'Estado', 'Piso/Zona', 'Capacidad'];
    const rows = spaces.map((space) => [
      space.space_types?.category?.display_name || '',
      space.space_types?.name || '',
      space.label,
      space.status,
      space.floor_zone || '',
      space.space_types?.capacity || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `espacios_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export default new SpacesService();
