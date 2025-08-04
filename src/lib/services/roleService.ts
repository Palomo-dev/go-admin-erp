import { supabase } from '@/lib/supabase/config';

export interface Role {
  id: number;
  name: string;
  description?: string;
  is_system: boolean;
  organization_id?: number;
  created_at?: string;
}

export interface RoleWithPermissions extends Role {
  permissions?: Permission[];
  permission_count?: number;
  member_count?: number;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
  category?: string;
  description?: string;
}

export interface RolePermission {
  id: number;
  role_id: number;
  permission_id: number;
  scope?: string;
  allowed: boolean;
}

export const roleService = {
  /**
   * Obtener todos los roles disponibles para una organización
   */
  async getRoles(organizationId: number): Promise<RoleWithPermissions[]> {
    const { data, error } = await supabase
      .from('roles')
      .select(`
        *,
        role_permissions(permission_id),
        organization_members(id)
      `)
      .or(`organization_id.eq.${organizationId},id.in.(2,3,4,5,22)`)
      .neq('id', 1) // Excluir Super Admin
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    // Procesar datos para agregar conteos
    return (data || []).map(role => ({
      ...role,
      permission_count: role.role_permissions?.length || 0,
      member_count: role.organization_members?.length || 0
    }));
  },

  /**
   * Obtener un rol específico con sus permisos
   */
  async getRoleById(roleId: number): Promise<RoleWithPermissions | null> {
    const { data, error } = await supabase
      .from('roles')
      .select(`
        *,
        role_permissions!inner(
          id,
          permission_id,
          scope,
          allowed,
          permissions!inner(*)
        )
      `)
      .eq('id', roleId)
      .single();
    
    if (error) throw error;
    
    if (data) {
      return {
        ...data,
        permissions: data.role_permissions?.map(rp => rp.permissions).filter(Boolean) || []
      };
    }
    
    return null;
  },

  /**
   * Crear un nuevo rol personalizado
   */
  async createRole(roleData: Omit<Role, 'id' | 'created_at' | 'is_system'>): Promise<Role> {
    const { data, error } = await supabase
      .from('roles')
      .insert({
        ...roleData,
        is_system: false
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Actualizar un rol existente
   */
  async updateRole(roleId: number, roleData: Partial<Omit<Role, 'id' | 'created_at' | 'is_system'>>): Promise<Role> {
    // Verificar que no sea un rol del sistema
    const { data: existingRole, error: checkError } = await supabase
      .from('roles')
      .select('is_system')
      .eq('id', roleId)
      .single();
    
    if (checkError) throw checkError;
    if (existingRole?.is_system) {
      throw new Error('No se pueden modificar roles del sistema');
    }

    const { data, error } = await supabase
      .from('roles')
      .update(roleData)
      .eq('id', roleId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Eliminar un rol personalizado
   */
  async deleteRole(roleId: number): Promise<void> {
    // Verificar que no sea un rol del sistema
    const { data: existingRole, error: checkError } = await supabase
      .from('roles')
      .select('is_system')
      .eq('id', roleId)
      .single();
    
    if (checkError) throw checkError;
    if (existingRole?.is_system) {
      throw new Error('No se pueden eliminar roles del sistema');
    }

    // Verificar que no tenga usuarios asignados
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('role_id', roleId)
      .limit(1);
    
    if (membersError) throw membersError;
    if (members && members.length > 0) {
      throw new Error('No se puede eliminar un rol que tiene usuarios asignados');
    }

    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);
    
    if (error) throw error;
  },

  /**
   * Clonar un rol existente
   */
  async cloneRole(roleId: number, newName: string, organizationId: number): Promise<Role> {
    // Obtener el rol original con sus permisos
    const originalRole = await this.getRoleById(roleId);
    if (!originalRole) {
      throw new Error('Rol no encontrado');
    }

    // Crear el nuevo rol
    const newRole = await this.createRole({
      name: newName,
      description: `Copia de ${originalRole.name}`,
      organization_id: organizationId
    });

    // Copiar los permisos si existen
    if (originalRole.permissions && originalRole.permissions.length > 0) {
      const permissionIds = originalRole.permissions.map(p => p.id);
      await this.setRolePermissions(newRole.id, permissionIds);
    }

    return newRole;
  },

  /**
   * Asignar permisos a un rol
   */
  async setRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    // Primero eliminamos los permisos existentes
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId);
    
    if (deleteError) throw deleteError;
    
    // Luego insertamos los nuevos permisos
    if (permissionIds.length > 0) {
      const rolePermissions = permissionIds.map(permissionId => ({
        role_id: roleId,
        permission_id: permissionId,
        allowed: true
      }));
      
      const { error } = await supabase
        .from('role_permissions')
        .insert(rolePermissions);
      
      if (error) throw error;
    }
  },

  /**
   * Obtener permisos de un rol específico
   */
  async getRolePermissions(roleId: number): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select(`
        permissions!inner(*)
      `)
      .eq('role_id', roleId)
      .eq('allowed', true);
    
    if (error) throw error;
    
    return (data || []).map(rp => rp.permissions).filter(Boolean);
  },

  /**
   * Obtener todos los permisos disponibles agrupados por módulo
   */
  async getPermissionsByModule(): Promise<{[module: string]: Permission[]}> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    // Agrupar por módulo
    const grouped: {[module: string]: Permission[]} = {};
    (data || []).forEach(permission => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = [];
      }
      grouped[permission.module].push(permission);
    });
    
    return grouped;
  },

  /**
   * Verificar si un usuario tiene un permiso específico
   */
  async userHasPermission(userId: string, organizationId: number, permissionCode: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        role_id,
        roles!inner(
          role_permissions!inner(
            permissions!inner(code)
          )
        )
      `)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    
    if (error || !data) return false;
    
    // Verificar si el usuario es super admin
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('is_super_admin')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();
    
    if (memberData?.is_super_admin) return true;
    
    // Verificar permisos específicos
    const hasPermission = data.roles?.role_permissions?.some(rp => 
      rp.permissions?.code === permissionCode
    ) || false;
    
    return hasPermission;
  },

  /**
   * Obtener todos los permisos de un usuario
   */
  async getUserPermissions(userId: string, organizationId: number): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        is_super_admin,
        roles!inner(
          role_permissions!inner(
            permissions!inner(*)
          )
        )
      `)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    
    if (error || !data) return [];
    
    // Si es super admin, obtener todos los permisos
    if (data.is_super_admin) {
      const { data: allPermissions, error: permError } = await supabase
        .from('permissions')
        .select('*');
      
      if (permError) throw permError;
      return allPermissions || [];
    }
    
    // Obtener permisos específicos del rol
    const permissions = data.roles?.role_permissions?.map(rp => rp.permissions).filter(Boolean) || [];
    return permissions;
  }
};
