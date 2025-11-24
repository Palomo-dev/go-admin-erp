import { supabase } from '@/lib/supabase/config';

export interface HousekeepingTask {
  id: string;
  space_id: string;
  task_date: string;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  notes?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  spaces?: {
    id: string;
    label: string;
    floor_zone?: string;
    space_types?: {
      name: string;
    };
  };
  assigned_user?: {
    id: string;
    email: string;
  };
}

export interface CreateHousekeepingTaskData {
  space_id: string;
  task_date: string;
  notes?: string;
  assigned_to?: string;
}

export interface UpdateHousekeepingTaskData {
  status?: 'pending' | 'in_progress' | 'done' | 'cancelled';
  notes?: string;
  assigned_to?: string;
}

export interface HousekeepingStats {
  total: number;
  pending: number;
  in_progress: number;
  done: number;
  cancelled: number;
}

class HousekeepingService {
  /**
   * Obtener todas las tareas de limpieza con filtros
   */
  async getTasks(filters?: {
    date?: string;
    status?: string;
    assigned_to?: string;
    space_id?: string;
  }): Promise<HousekeepingTask[]> {
    try {
      let query = supabase
        .from('housekeeping_tasks')
        .select(`
          id,
          space_id,
          task_date,
          status,
          notes,
          assigned_to,
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
        .order('task_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.date) {
        query = query.eq('task_date', filters.date);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      if (filters?.space_id) {
        query = query.eq('space_id', filters.space_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Mapear las relaciones anidadas de array a objeto
      return ((data || []) as any[]).map(task => {
        const spaces = Array.isArray(task.spaces) ? task.spaces[0] : task.spaces;
        return {
          ...task,
          spaces: spaces ? {
            ...spaces,
            space_types: Array.isArray(spaces.space_types) ? spaces.space_types[0] : spaces.space_types,
          } : undefined,
        };
      }) as HousekeepingTask[];
    } catch (error) {
      console.error('Error obteniendo tareas de limpieza:', error);
      throw error;
    }
  }

  /**
   * Obtener tareas del día actual
   */
  async getTodayTasks(): Promise<HousekeepingTask[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getTasks({ date: today });
  }

  /**
   * Obtener estadísticas de tareas
   */
  async getStats(date?: string): Promise<HousekeepingStats> {
    try {
      let query = supabase
        .from('housekeeping_tasks')
        .select('status');

      if (date) {
        query = query.eq('task_date', date);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats: HousekeepingStats = {
        total: data?.length || 0,
        pending: data?.filter(t => t.status === 'pending').length || 0,
        in_progress: data?.filter(t => t.status === 'in_progress').length || 0,
        done: data?.filter(t => t.status === 'done').length || 0,
        cancelled: data?.filter(t => t.status === 'cancelled').length || 0,
      };

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Crear nueva tarea de limpieza
   */
  async createTask(data: CreateHousekeepingTaskData): Promise<HousekeepingTask> {
    try {
      const { data: task, error } = await supabase
        .from('housekeeping_tasks')
        .insert({
          ...data,
          status: 'pending',
        })
        .select(`
          id,
          space_id,
          task_date,
          status,
          notes,
          assigned_to,
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
      
      // Mapear relaciones anidadas
      const spaces = Array.isArray(task.spaces) ? task.spaces[0] : task.spaces;
      const mappedTask = {
        ...task,
        spaces: spaces ? {
          ...spaces,
          space_types: Array.isArray(spaces.space_types) ? spaces.space_types[0] : spaces.space_types,
        } : undefined,
      };
      
      return mappedTask as HousekeepingTask;
    } catch (error) {
      console.error('Error creando tarea de limpieza:', error);
      throw error;
    }
  }

  /**
   * Actualizar tarea de limpieza
   */
  async updateTask(
    taskId: string,
    updates: UpdateHousekeepingTaskData
  ): Promise<HousekeepingTask> {
    try {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select(`
          id,
          space_id,
          task_date,
          status,
          notes,
          assigned_to,
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

      // Si la tarea se marca como completada, actualizar el espacio a 'available'
      if (updates.status === 'done' && data.space_id) {
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

      // Mapear relaciones anidadas
      const spaces = Array.isArray(data.spaces) ? data.spaces[0] : data.spaces;
      const mappedData = {
        ...data,
        spaces: spaces ? {
          ...spaces,
          space_types: Array.isArray(spaces.space_types) ? spaces.space_types[0] : spaces.space_types,
        } : undefined,
      };

      return mappedData as HousekeepingTask;
    } catch (error) {
      console.error('Error actualizando tarea:', error);
      throw error;
    }
  }

  /**
   * Eliminar tarea de limpieza
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('housekeeping_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando tarea:', error);
      throw error;
    }
  }

  /**
   * Asignar tarea a usuario
   */
  async assignTask(taskId: string, userId: string): Promise<HousekeepingTask> {
    return this.updateTask(taskId, { assigned_to: userId });
  }

  /**
   * Cambiar estado de tarea
   */
  async updateTaskStatus(
    taskId: string,
    status: 'pending' | 'in_progress' | 'done' | 'cancelled'
  ): Promise<HousekeepingTask> {
    return this.updateTask(taskId, { status });
  }

  /**
   * Obtener tareas por espacio
   */
  async getTasksBySpace(spaceId: string): Promise<HousekeepingTask[]> {
    return this.getTasks({ space_id: spaceId });
  }

  /**
   * Obtener tareas asignadas a un usuario
   */
  async getTasksByUser(userId: string): Promise<HousekeepingTask[]> {
    return this.getTasks({ assigned_to: userId });
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

export default new HousekeepingService();
