import { supabase } from '@/lib/supabase/config';

export interface MaintenanceOrder {
  id: string;
  branch_id: number;
  space_id?: string;
  description: string;
  priority: 'low' | 'med' | 'high';
  status: 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  cost_estimate?: number;
  reported_by?: string;
  assigned_to?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  spaces?: {
    id: string;
    label: string;
    floor_zone?: string;
    space_types?: {
      name: string;
    };
  };
  reported_user?: {
    id: string;
    email: string;
  };
  assigned_user?: {
    id: string;
    email: string;
  };
  // Campos adicionales (metadata)
  issue_type?: string;
  materials?: string;
  photos?: string[];
  actual_cost?: number;
}

export interface CreateMaintenanceOrderData {
  branch_id: number;
  space_id?: string;
  description: string;
  priority: 'low' | 'med' | 'high';
  cost_estimate?: number;
  reported_by?: string;
  assigned_to?: string;
  issue_type?: string;
  materials?: string;
}

export interface UpdateMaintenanceOrderData {
  description?: string;
  priority?: 'low' | 'med' | 'high';
  status?: 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  cost_estimate?: number;
  assigned_to?: string;
  issue_type?: string;
  materials?: string;
  photos?: string[];
  actual_cost?: number;
}

export interface MaintenanceStats {
  total: number;
  reported: number;
  assigned: number;
  in_progress: number;
  on_hold: number;
  completed: number;
  cancelled: number;
}

class MaintenanceService {
  /**
   * Obtener todas las órdenes de mantenimiento con filtros
   */
  async getOrders(filters?: {
    status?: string;
    priority?: string;
    space_id?: string;
    assigned_to?: string;
    branch_id?: number;
  }): Promise<MaintenanceOrder[]> {
    try {
      let query = supabase
        .from('maintenance_orders')
        .select(`
          id,
          branch_id,
          space_id,
          description,
          priority,
          status,
          cost_estimate,
          reported_by,
          assigned_to,
          resolved_at,
          created_at,
          updated_at,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.priority) {
        query = query.eq('priority', filters.priority);
      }

      if (filters?.space_id) {
        query = query.eq('space_id', filters.space_id);
      }

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      if (filters?.branch_id) {
        query = query.eq('branch_id', filters.branch_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Obtener información de usuarios
      if (data && data.length > 0) {
        const userIds = [
          ...data.filter(order => order.reported_by).map(order => order.reported_by),
          ...data.filter(order => order.assigned_to).map(order => order.assigned_to),
        ].filter((id, index, self) => id && self.indexOf(id) === index);

        if (userIds.length > 0) {
          const { data: users } = await supabase.auth.admin.listUsers();
          
          return data.map(order => {
            const spaces = order.spaces?.[0] || order.spaces;
            return {
              ...order,
              spaces: spaces ? {
                ...spaces,
                space_types: spaces.space_types?.[0] || spaces.space_types
              } : undefined,
              reported_user: order.reported_by 
                ? users?.users?.find(u => u.id === order.reported_by)
                : undefined,
              assigned_user: order.assigned_to 
                ? users?.users?.find(u => u.id === order.assigned_to)
                : undefined,
            };
          }) as MaintenanceOrder[];
        }
      }

      // Transformar data para que spaces sea un objeto en lugar de array
      return ((data || []) as any[]).map(order => {
        const spaces = order.spaces?.[0] || order.spaces;
        return {
          ...order,
          spaces: spaces ? {
            ...spaces,
            space_types: spaces.space_types?.[0] || spaces.space_types
          } : undefined
        };
      }) as MaintenanceOrder[];
    } catch (error) {
      console.error('Error obteniendo órdenes de mantenimiento:', error);
      throw error;
    }
  }

  /**
   * Obtener órdenes activas (no completadas ni canceladas)
   */
  async getActiveOrders(branchId?: number): Promise<MaintenanceOrder[]> {
    try {
      let query = supabase
        .from('maintenance_orders')
        .select(`
          id,
          branch_id,
          space_id,
          description,
          priority,
          status,
          cost_estimate,
          reported_by,
          assigned_to,
          resolved_at,
          created_at,
          updated_at,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        `)
        .in('status', ['reported', 'assigned', 'in_progress', 'on_hold'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;
      // Transformar data para que spaces sea un objeto en lugar de array
      return ((data || []) as any[]).map(order => {
        const spaces = order.spaces?.[0] || order.spaces;
        return {
          ...order,
          spaces: spaces ? {
            ...spaces,
            space_types: spaces.space_types?.[0] || spaces.space_types
          } : undefined
        };
      }) as MaintenanceOrder[];
    } catch (error) {
      console.error('Error obteniendo órdenes activas:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de órdenes
   */
  async getStats(branchId?: number): Promise<MaintenanceStats> {
    try {
      let query = supabase
        .from('maintenance_orders')
        .select('status');

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats: MaintenanceStats = {
        total: data?.length || 0,
        reported: data?.filter(o => o.status === 'reported').length || 0,
        assigned: data?.filter(o => o.status === 'assigned').length || 0,
        in_progress: data?.filter(o => o.status === 'in_progress').length || 0,
        on_hold: data?.filter(o => o.status === 'on_hold').length || 0,
        completed: data?.filter(o => o.status === 'completed').length || 0,
        cancelled: data?.filter(o => o.status === 'cancelled').length || 0,
      };

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Crear nueva orden de mantenimiento
   */
  async createOrder(data: CreateMaintenanceOrderData): Promise<MaintenanceOrder> {
    try {
      const { data: order, error } = await supabase
        .from('maintenance_orders')
        .insert({
          branch_id: data.branch_id,
          space_id: data.space_id,
          description: data.description,
          priority: data.priority,
          cost_estimate: data.cost_estimate,
          reported_by: data.reported_by,
          assigned_to: data.assigned_to,
          status: 'reported',
        })
        .select(`
          id,
          branch_id,
          space_id,
          description,
          priority,
          status,
          cost_estimate,
          reported_by,
          assigned_to,
          resolved_at,
          created_at,
          updated_at,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        `)
        .single();

      if (error) throw error;

      // Si hay un espacio asignado, actualizar su estado a 'maintenance'
      if (data.space_id) {
        const { error: spaceError } = await supabase
          .from('spaces')
          .update({
            status: 'maintenance',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.space_id);

        if (spaceError) {
          console.error('Error actualizando estado del espacio:', spaceError);
        }
      }

      // Transformar spaces de array a objeto
      const spaces = order.spaces?.[0] || order.spaces;
      return {
        ...order,
        spaces: spaces ? {
          ...spaces,
          space_types: spaces.space_types?.[0] || spaces.space_types
        } : undefined
      } as MaintenanceOrder;
    } catch (error) {
      console.error('Error creando orden de mantenimiento:', error);
      throw error;
    }
  }

  /**
   * Actualizar orden de mantenimiento
   */
  async updateOrder(
    orderId: string,
    updates: UpdateMaintenanceOrderData
  ): Promise<MaintenanceOrder> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Si se marca como completada, agregar timestamp
      if (updates.status === 'completed') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('maintenance_orders')
        .update(updateData)
        .eq('id', orderId)
        .select(`
          id,
          branch_id,
          space_id,
          description,
          priority,
          status,
          cost_estimate,
          reported_by,
          assigned_to,
          resolved_at,
          created_at,
          updated_at,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        `)
        .single();

      if (error) throw error;

      // Si se completa, actualizar estado del espacio a 'available'
      if (updates.status === 'completed' && data.space_id) {
        const { error: spaceError } = await supabase
          .from('spaces')
          .update({
            status: 'available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.space_id);

        if (spaceError) {
          console.error('Error actualizando estado del espacio:', spaceError);
        }
      }

      // Transformar spaces de array a objeto
      const spaces = data.spaces?.[0] || data.spaces;
      return {
        ...data,
        spaces: spaces ? {
          ...spaces,
          space_types: spaces.space_types?.[0] || spaces.space_types
        } : undefined
      } as MaintenanceOrder;
    } catch (error) {
      console.error('Error actualizando orden:', error);
      throw error;
    }
  }

  /**
   * Eliminar orden de mantenimiento
   */
  async deleteOrder(orderId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('maintenance_orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando orden:', error);
      throw error;
    }
  }

  /**
   * Asignar orden a técnico
   */
  async assignOrder(orderId: string, technicianId: string): Promise<MaintenanceOrder> {
    return this.updateOrder(orderId, {
      assigned_to: technicianId,
      status: 'assigned',
    });
  }

  /**
   * Cambiar estado de orden
   */
  async updateOrderStatus(
    orderId: string,
    status: 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
  ): Promise<MaintenanceOrder> {
    return this.updateOrder(orderId, { status });
  }

  /**
   * Marcar orden como resuelta
   */
  async resolveOrder(orderId: string): Promise<MaintenanceOrder> {
    return this.updateOrder(orderId, { status: 'completed' });
  }

  /**
   * Obtener órdenes por espacio
   */
  async getOrdersBySpace(spaceId: string): Promise<MaintenanceOrder[]> {
    return this.getOrders({ space_id: spaceId });
  }

  /**
   * Obtener órdenes asignadas a un técnico
   */
  async getOrdersByTechnician(technicianId: string): Promise<MaintenanceOrder[]> {
    return this.getOrders({ assigned_to: technicianId });
  }

  /**
   * Obtener usuarios disponibles para asignar (miembros activos de la organización)
   */
  async getAvailableUsers(organizationId: number): Promise<Array<{ id: string; email: string; name: string }>> {
    try {
      // Obtener usuarios miembros activos de la organización
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          user_id,
          user_display_info!inner (
            id,
            email,
            name
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('user_display_info(name)');
      
      if (error) throw error;

      return (data || []).map((member: any) => {
        const userInfo = Array.isArray(member.user_display_info) 
          ? member.user_display_info[0] 
          : member.user_display_info;
        return {
          id: userInfo.id,
          email: userInfo.email || 'Sin email',
          name: userInfo.name || 'Sin nombre'
        };
      });
    } catch (error) {
      console.error('Error obteniendo usuarios:', error);
      return [];
    }
  }
}

export default new MaintenanceService();
