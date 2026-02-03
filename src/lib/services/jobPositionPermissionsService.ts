import { supabase } from '@/lib/supabase/config';

export interface JobPositionPermission {
  id: string;
  job_position_id: string;
  permission_id: number;
  allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobPositionPermissionWithDetails extends JobPositionPermission {
  permission?: {
    id: number;
    code: string;
    name: string;
    description: string;
    module: string;
    category: string;
  };
}

export const jobPositionPermissionsService = {
  /**
   * Obtener permisos de un cargo
   */
  async getJobPositionPermissions(jobPositionId: string): Promise<number[]> {
    const { data, error } = await supabase
      .from('job_position_permissions')
      .select('permission_id')
      .eq('job_position_id', jobPositionId)
      .eq('allowed', true);

    if (error) throw error;
    return (data || []).map(p => p.permission_id);
  },

  /**
   * Obtener permisos de un cargo con detalles
   */
  async getJobPositionPermissionsWithDetails(jobPositionId: string): Promise<JobPositionPermissionWithDetails[]> {
    const { data, error } = await supabase
      .from('job_position_permissions')
      .select(`
        *,
        permission:permissions(*)
      `)
      .eq('job_position_id', jobPositionId)
      .eq('allowed', true);

    if (error) throw error;
    return data || [];
  },

  /**
   * Establecer permisos de un cargo (reemplaza todos los existentes)
   */
  async setJobPositionPermissions(jobPositionId: string, permissionIds: number[]): Promise<void> {
    // Primero eliminar todos los permisos existentes
    const { error: deleteError } = await supabase
      .from('job_position_permissions')
      .delete()
      .eq('job_position_id', jobPositionId);

    if (deleteError) throw deleteError;

    // Luego insertar los nuevos permisos
    if (permissionIds.length > 0) {
      const permissions = permissionIds.map(permissionId => ({
        job_position_id: jobPositionId,
        permission_id: permissionId,
        allowed: true
      }));

      const { error: insertError } = await supabase
        .from('job_position_permissions')
        .insert(permissions);

      if (insertError) throw insertError;
    }
  },

  /**
   * Agregar un permiso a un cargo
   */
  async addPermission(jobPositionId: string, permissionId: number): Promise<void> {
    const { error } = await supabase
      .from('job_position_permissions')
      .insert({
        job_position_id: jobPositionId,
        permission_id: permissionId,
        allowed: true
      });

    if (error) throw error;
  },

  /**
   * Remover un permiso de un cargo
   */
  async removePermission(jobPositionId: string, permissionId: number): Promise<void> {
    const { error } = await supabase
      .from('job_position_permissions')
      .delete()
      .eq('job_position_id', jobPositionId)
      .eq('permission_id', permissionId);

    if (error) throw error;
  },

  /**
   * Verificar si un cargo tiene un permiso específico
   */
  async hasPermission(jobPositionId: string, permissionId: number): Promise<boolean> {
    const { data, error } = await supabase
      .from('job_position_permissions')
      .select('id')
      .eq('job_position_id', jobPositionId)
      .eq('permission_id', permissionId)
      .eq('allowed', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }
};
