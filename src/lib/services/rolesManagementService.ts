import { supabase } from '@/lib/supabase/config';

// ============= INTERFACES =============

export interface Role {
  id: number;
  name: string;
  description?: string;
  is_system: boolean;
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

export interface JobPosition {
  id: string;
  organization_id: number;
  department_id?: string;
  code: string;
  name: string;
  description?: string;
  level?: string;
  min_salary?: number;
  max_salary?: number;
  requirements?: any;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface JobPositionWithPermissions extends JobPosition {
  permissions?: Permission[];
  permission_count?: number;
  employee_count?: number;
  department?: {
    id: string;
    name: string;
  };
}

export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: number;
  role_id: number;
  job_position_id?: string;
  is_active: boolean;
  created_at?: string;
}

export interface RoleAnalytics {
  total_roles: number;
  system_roles: number;
  custom_roles: number;
  total_permissions: number;
  total_members: number;
  roles_by_member_count: Array<{
    role_name: string;
    member_count: number;
  }>;
  permissions_by_module: Array<{
    module: string;
    permission_count: number;
  }>;
}

// ============= SERVICIO PRINCIPAL =============

export const rolesManagementService = {
  // ============= ROLES =============

  async getRoles(organizationId: number): Promise<RoleWithPermissions[]> {
    const { data, error } = await supabase
      .from('roles')
      .select(`
        *,
        role_permissions(permission_id),
        organization_members!organization_members_role_id_fkey(id)
      `)
      .neq('id', 1)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    return (data || []).map(role => ({
      ...role,
      permission_count: role.role_permissions?.length || 0,
      member_count: role.organization_members?.length || 0
    }));
  },

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
        permissions: data.role_permissions?.map((rp: any) => rp.permissions).filter(Boolean) || []
      };
    }
    
    return null;
  },

  async createRole(roleData: Omit<Role, 'id' | 'created_at' | 'is_system'>): Promise<Role> {
    const { data, error } = await supabase
      .from('roles')
      .insert({
        name: roleData.name,
        description: roleData.description,
        is_system: false
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateRole(roleId: number, roleData: Partial<Omit<Role, 'id' | 'created_at' | 'is_system'>>): Promise<Role> {
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

  async deleteRole(roleId: number): Promise<void> {
    const { data: existingRole, error: checkError } = await supabase
      .from('roles')
      .select('is_system')
      .eq('id', roleId)
      .single();
    
    if (checkError) throw checkError;
    if (existingRole?.is_system) {
      throw new Error('No se pueden eliminar roles del sistema');
    }

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

  async cloneRole(roleId: number, newName: string): Promise<Role> {
    const originalRole = await this.getRoleById(roleId);
    if (!originalRole) {
      throw new Error('Rol no encontrado');
    }

    const newRole = await this.createRole({
      name: newName,
      description: `Copia de ${originalRole.name}`
    });

    if (originalRole.permissions && originalRole.permissions.length > 0) {
      const permissionIds = originalRole.permissions.map(p => p.id);
      await this.setRolePermissions(newRole.id, permissionIds);
    }

    return newRole;
  },

  // ============= PERMISOS =============

  async getAllPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async getPermissionsByModule(): Promise<{[module: string]: Permission[]}> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    const grouped: {[module: string]: Permission[]} = {};
    (data || []).forEach(permission => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = [];
      }
      grouped[permission.module].push(permission);
    });
    
    return grouped;
  },

  async getRolePermissions(roleId: number): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select(`
        permissions!inner(*)
      `)
      .eq('role_id', roleId)
      .eq('allowed', true);
    
    if (error) throw error;
    
    return (data || []).map((rp: any) => rp.permissions).filter(Boolean);
  },

  async setRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId);
    
    if (deleteError) throw deleteError;
    
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

  // ============= CARGOS (JOB POSITIONS) =============

  async getJobPositions(organizationId: number): Promise<JobPositionWithPermissions[]> {
    const { data, error } = await supabase
      .from('job_positions')
      .select(`
        *,
        departments(id, name),
        job_position_permissions(permission_id),
        employments(id)
      `)
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    return (data || []).map(position => ({
      ...position,
      department: position.departments,
      permission_count: position.job_position_permissions?.length || 0,
      employee_count: position.employments?.length || 0
    }));
  },

  async getJobPositionById(positionId: string): Promise<JobPositionWithPermissions | null> {
    const { data, error } = await supabase
      .from('job_positions')
      .select(`
        *,
        departments(id, name),
        job_position_permissions!inner(
          id,
          permission_id,
          allowed,
          permissions!inner(*)
        )
      `)
      .eq('id', positionId)
      .single();
    
    if (error) throw error;
    
    if (data) {
      return {
        ...data,
        department: data.departments,
        permissions: data.job_position_permissions?.map((jp: any) => jp.permissions).filter(Boolean) || []
      };
    }
    
    return null;
  },

  async createJobPosition(positionData: Omit<JobPosition, 'id' | 'created_at' | 'updated_at'>): Promise<JobPosition> {
    const { data, error } = await supabase
      .from('job_positions')
      .insert(positionData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateJobPosition(positionId: string, positionData: Partial<Omit<JobPosition, 'id' | 'created_at' | 'updated_at'>>): Promise<JobPosition> {
    const { data, error } = await supabase
      .from('job_positions')
      .update(positionData)
      .eq('id', positionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteJobPosition(positionId: string): Promise<void> {
    const { data: employments, error: employmentsError } = await supabase
      .from('employments')
      .select('id')
      .eq('job_position_id', positionId)
      .limit(1);
    
    if (employmentsError) throw employmentsError;
    if (employments && employments.length > 0) {
      throw new Error('No se puede eliminar un cargo que tiene empleados asignados');
    }

    const { error } = await supabase
      .from('job_positions')
      .delete()
      .eq('id', positionId);
    
    if (error) throw error;
  },

  async getJobPositionPermissions(positionId: string): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('job_position_permissions')
      .select(`
        permissions!inner(*)
      `)
      .eq('job_position_id', positionId)
      .eq('allowed', true);
    
    if (error) throw error;
    
    return (data || []).map((jp: any) => jp.permissions).filter(Boolean);
  },

  async setJobPositionPermissions(positionId: string, permissionIds: number[]): Promise<void> {
    const { error: deleteError } = await supabase
      .from('job_position_permissions')
      .delete()
      .eq('job_position_id', positionId);
    
    if (deleteError) throw deleteError;
    
    if (permissionIds.length > 0) {
      const positionPermissions = permissionIds.map(permissionId => ({
        job_position_id: positionId,
        permission_id: permissionId,
        allowed: true
      }));
      
      const { error } = await supabase
        .from('job_position_permissions')
        .insert(positionPermissions);
      
      if (error) throw error;
    }
  },

  // ============= ASIGNACIÓN =============

  async getOrganizationMembers(organizationId: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        *,
        roles(id, name),
        job_positions(id, name),
        users:user_id(id, email, raw_user_meta_data)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async assignRoleToMember(memberId: string, roleId: number): Promise<void> {
    const { error } = await supabase
      .from('organization_members')
      .update({ role_id: roleId })
      .eq('id', memberId);
    
    if (error) throw error;
  },

  async assignJobPositionToMember(memberId: string, jobPositionId: string | null): Promise<void> {
    const { error } = await supabase
      .from('organization_members')
      .update({ job_position_id: jobPositionId })
      .eq('id', memberId);
    
    if (error) throw error;
  },

  // ============= ANALÍTICAS =============

  async getRoleAnalytics(organizationId: number): Promise<RoleAnalytics> {
    // Obtener roles
    const roles = await this.getRoles(organizationId);
    
    // Obtener permisos
    const permissions = await this.getAllPermissions();
    
    // Obtener miembros
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('id, role_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (membersError) throw membersError;
    
    // Calcular estadísticas
    const systemRoles = roles.filter(r => r.is_system).length;
    const customRoles = roles.filter(r => !r.is_system).length;
    
    // Roles por cantidad de miembros
    const rolesMemberCount = roles.map(role => ({
      role_name: role.name,
      member_count: role.member_count || 0
    })).sort((a, b) => b.member_count - a.member_count);
    
    // Permisos por módulo
    const permissionsByModule: {[key: string]: number} = {};
    permissions.forEach(p => {
      permissionsByModule[p.module] = (permissionsByModule[p.module] || 0) + 1;
    });
    
    const permissionsModuleArray = Object.entries(permissionsByModule).map(([module, count]) => ({
      module,
      permission_count: count
    })).sort((a, b) => b.permission_count - a.permission_count);
    
    return {
      total_roles: roles.length,
      system_roles: systemRoles,
      custom_roles: customRoles,
      total_permissions: permissions.length,
      total_members: members?.length || 0,
      roles_by_member_count: rolesMemberCount,
      permissions_by_module: permissionsModuleArray
    };
  },

  // ============= IMPORTAR/EXPORTAR =============

  async exportRolesMatrix(): Promise<any> {
    const roles = await this.getRoles(0);
    const permissions = await this.getAllPermissions();
    
    const matrix: any = {
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_system: r.is_system
      })),
      permissions: permissions.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        module: p.module,
        category: p.category
      })),
      role_permissions: []
    };
    
    for (const role of roles) {
      const rolePerms = await this.getRolePermissions(role.id);
      rolePerms.forEach(perm => {
        matrix.role_permissions.push({
          role_id: role.id,
          permission_id: perm.id
        });
      });
    }
    
    return matrix;
  },

  async importRolesMatrix(matrix: any): Promise<void> {
    // Validar estructura
    if (!matrix.roles || !matrix.permissions || !matrix.role_permissions) {
      throw new Error('Formato de matriz inválido');
    }
    
    // Importar roles (solo personalizados)
    for (const role of matrix.roles) {
      if (!role.is_system) {
        try {
          await this.createRole({
            name: role.name,
            description: role.description
          });
        } catch (error) {
          console.error(`Error importando rol ${role.name}:`, error);
        }
      }
    }
    
    // Importar asignaciones de permisos
    for (const rp of matrix.role_permissions) {
      try {
        const { error } = await supabase
          .from('role_permissions')
          .insert({
            role_id: rp.role_id,
            permission_id: rp.permission_id,
            allowed: true
          });
        
        if (error) console.error('Error importando permiso:', error);
      } catch (error) {
        console.error('Error importando permiso:', error);
      }
    }
  }
};

export default rolesManagementService;
