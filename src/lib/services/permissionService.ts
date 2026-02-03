import { supabase } from '@/lib/supabase/config';
import { Permission } from './roleService';
import { moduleManagementService } from './moduleManagementService';

export interface ModulePermissions {
  module: string;
  moduleName: string;
  permissions: Permission[];
}

export interface UserPermissionCheck {
  hasPermission: boolean;
  isSuperAdmin: boolean;
  roleId?: number;
  roleName?: string;
}

export const permissionService = {
  /**
   * Obtener todos los permisos disponibles
   */
  async getAllPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener permisos agrupados por módulo con nombres de módulos
   */
  async getPermissionsByModule(): Promise<ModulePermissions[]> {
    // Obtener permisos
    const { data: permissions, error: permError } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true })
      .order('name', { ascending: true });
    
    if (permError) throw permError;

    // Obtener información de módulos
    const { data: modules, error: moduleError } = await supabase
      .from('modules')
      .select('code, name')
      .order('rank', { ascending: true });
    
    if (moduleError) throw moduleError;

    // Crear mapa de módulos para nombres
    const moduleMap = new Map();
    (modules || []).forEach(module => {
      moduleMap.set(module.code, module.name);
    });

    // Agrupar permisos por módulo
    const grouped: {[module: string]: Permission[]} = {};
    (permissions || []).forEach(permission => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = [];
      }
      grouped[permission.module].push(permission);
    });

    // Convertir a array con nombres de módulos
    return Object.entries(grouped).map(([moduleCode, perms]) => ({
      module: moduleCode,
      moduleName: moduleMap.get(moduleCode) || moduleCode,
      permissions: perms
    }));
  },

  /**
   * Obtener permisos de un módulo específico
   */
  async getModulePermissions(moduleCode: string): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('module', moduleCode)
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Verificar si un usuario tiene un permiso específico
   * Usa la función RPC check_user_permission que combina ROL + CARGO con precedencia del cargo
   */
  async checkUserPermission(
    userId: string, 
    organizationId: number, 
    permissionCode: string
  ): Promise<UserPermissionCheck> {
    // Obtener datos del miembro
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select(`
        is_super_admin,
        role_id,
        job_position_id,
        roles(name)
      `)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    
    if (memberError || !memberData) {
      return {
        hasPermission: false,
        isSuperAdmin: false
      };
    }

    // Si es super admin, tiene todos los permisos
    if (memberData.is_super_admin) {
      return {
        hasPermission: true,
        isSuperAdmin: true,
        roleId: memberData.role_id,
        roleName: (memberData.roles as any)?.name
      };
    }

    // Usar RPC check_user_permission que combina ROL + CARGO con precedencia
    const { data: hasPermission, error: rpcError } = await supabase
      .rpc('check_user_permission', {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_permission_code: permissionCode
      });

    if (rpcError) {
      console.warn('Error en RPC check_user_permission:', rpcError);
      // Fallback: verificar solo en rol
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('permissions!inner(code)')
        .eq('role_id', memberData.role_id)
        .eq('allowed', true);
      
      const fallbackHasPermission = rolePerms?.some((rp: any) => 
        rp.permissions?.code === permissionCode
      ) || false;

      return {
        hasPermission: fallbackHasPermission,
        isSuperAdmin: false,
        roleId: memberData.role_id,
        roleName: (memberData.roles as any)?.name
      };
    }

    return {
      hasPermission: hasPermission || false,
      isSuperAdmin: false,
      roleId: memberData.role_id,
      roleName: (memberData.roles as any)?.name
    };
  },

  /**
   * Verificar múltiples permisos de un usuario
   * Usa la función RPC get_user_permission_codes que combina ROL + CARGO con precedencia
   */
  async checkMultiplePermissions(
    userId: string,
    organizationId: number,
    permissionCodes: string[]
  ): Promise<{[permissionCode: string]: boolean}> {
    // Verificar si es super admin
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('is_super_admin')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    
    if (memberError || !memberData) {
      return permissionCodes.reduce((acc, code) => {
        acc[code] = false;
        return acc;
      }, {} as {[key: string]: boolean});
    }

    // Si es super admin, tiene todos los permisos
    if (memberData.is_super_admin) {
      return permissionCodes.reduce((acc, code) => {
        acc[code] = true;
        return acc;
      }, {} as {[key: string]: boolean});
    }

    // Usar RPC para obtener permisos combinados ROL + CARGO
    const { data: userPermissions, error: rpcError } = await supabase
      .rpc('get_user_permission_codes', {
        p_user_id: userId,
        p_organization_id: organizationId
      });

    if (rpcError) {
      console.warn('Error en RPC get_user_permission_codes:', rpcError);
      return permissionCodes.reduce((acc, code) => {
        acc[code] = false;
        return acc;
      }, {} as {[key: string]: boolean});
    }

    const permissionList = userPermissions || [];

    // Verificar cada permiso solicitado
    return permissionCodes.reduce((acc, code) => {
      acc[code] = permissionList.includes(code);
      return acc;
    }, {} as {[key: string]: boolean});
  },

  /**
   * Obtener todos los permisos de un usuario
   * Usa la función RPC get_user_permissions_with_precedence que combina ROL + CARGO
   */
  async getUserPermissions(userId: string, organizationId: number): Promise<Permission[]> {
    // Verificar si es super admin
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('is_super_admin')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    
    if (memberError || !memberData) return [];

    // Si es super admin, obtener todos los permisos
    if (memberData.is_super_admin) {
      return await this.getAllPermissions();
    }

    // Usar RPC para obtener permisos combinados ROL + CARGO con precedencia
    const { data: permissions, error: rpcError } = await supabase
      .rpc('get_user_permissions_with_precedence', {
        p_user_id: userId,
        p_organization_id: organizationId
      });

    if (rpcError) {
      console.warn('Error en RPC get_user_permissions_with_precedence:', rpcError);
      return [];
    }

    // Mapear resultado de RPC a formato Permission
    return (permissions || []).map((p: any) => ({
      id: 0, // No tenemos el ID en el resultado de RPC, pero no es necesario para validación
      code: p.permission_code,
      name: p.permission_name || p.permission_code,
      module: p.permission_module || '',
      category: p.permission_category,
      description: p.permission_description
    }));
  },

  /**
   * Verificar si un usuario puede acceder a un módulo (con verificación de plan)
   */
  async canAccessModule(userId: string, organizationId: number, moduleCode: string): Promise<boolean> {
    // Usar el servicio de gestión de módulos para verificar acceso
    const canAccess = await moduleManagementService.canAccessModule(organizationId, moduleCode);
    if (!canAccess) return false;

    // Obtener permisos del módulo
    const modulePermissions = await this.getModulePermissions(moduleCode);
    if (modulePermissions.length === 0) return true; // Si no hay permisos definidos, permitir acceso

    // Verificar si el usuario tiene al menos un permiso del módulo
    const permissionCodes = modulePermissions.map(p => p.code);
    const userPermissions = await this.checkMultiplePermissions(userId, organizationId, permissionCodes);
    
    return Object.values(userPermissions).some(hasPermission => hasPermission);
  },

  /**
   * Obtener módulos accesibles para un usuario
   */
  async getUserAccessibleModules(userId: string, organizationId: number): Promise<string[]> {
    // Obtener módulos activos de la organización
    const { data: orgModules, error: orgError } = await supabase
      .from('organization_modules')
      .select('module_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (orgError) throw orgError;

    const accessibleModules: string[] = [];
    
    for (const orgModule of orgModules || []) {
      const canAccess = await this.canAccessModule(userId, organizationId, orgModule.module_code);
      if (canAccess) {
        accessibleModules.push(orgModule.module_code);
      }
    }

    return accessibleModules;
  },

  /**
   * Buscar permisos por texto
   */
  async searchPermissions(searchTerm: string): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
      .order('module', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener estadísticas de permisos
   */
  async getPermissionStats(): Promise<{
    totalPermissions: number;
    permissionsByModule: {[module: string]: number};
    mostUsedPermissions: {permission: Permission; roleCount: number}[];
  }> {
    // Total de permisos
    const { data: allPermissions, error: permError } = await supabase
      .from('permissions')
      .select('*');
    
    if (permError) throw permError;

    // Permisos por módulo
    const permissionsByModule: {[module: string]: number} = {};
    (allPermissions || []).forEach(permission => {
      permissionsByModule[permission.module] = (permissionsByModule[permission.module] || 0) + 1;
    });

    // Permisos más utilizados
    const { data: rolePermissions, error: rpError } = await supabase
      .from('role_permissions')
      .select(`
        permission_id,
        permissions!inner(*)
      `)
      .eq('allowed', true);
    
    if (rpError) throw rpError;

    const permissionUsage: {[permissionId: number]: {permission: Permission; count: number}} = {};
    (rolePermissions || []).forEach((rp: any) => {
      if (rp.permissions) {
        const id = rp.permission_id;
        if (!permissionUsage[id]) {
          permissionUsage[id] = {
            permission: rp.permissions as Permission,
            count: 0
          };
        }
        permissionUsage[id].count++;
      }
    });

    const mostUsedPermissions = Object.values(permissionUsage)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        permission: item.permission,
        roleCount: item.count
      }));

    return {
      totalPermissions: allPermissions?.length || 0,
      permissionsByModule,
      mostUsedPermissions
    };
  },

  /**
   * Obtener módulos activos con información de permisos para un usuario
   */
  async getUserModulesWithPermissions(userId: string, organizationId: number): Promise<Array<{
    module: any;
    hasAccess: boolean;
    permissions: Permission[];
  }>> {
    const activeModules = await moduleManagementService.getActiveModules(organizationId);
    const result = [];

    for (const module of activeModules) {
      const hasAccess = await this.canAccessModule(userId, organizationId, module.code);
      const permissions = await this.getModulePermissions(module.code);
      
      result.push({
        module,
        hasAccess,
        permissions
      });
    }

    return result;
  },

  /**
   * Verificar acceso a módulo con información detallada del plan
   */
  async checkModuleAccessWithPlanInfo(userId: string, organizationId: number, moduleCode: string): Promise<{
    canAccess: boolean;
    reason?: string;
    planInfo?: any;
    moduleInfo?: any;
  }> {
    try {
      // Obtener información del estado de módulos de la organización
      const orgStatus = await moduleManagementService.getOrganizationModuleStatus(organizationId);
      
      // Verificar si el módulo está disponible
      const module = [...orgStatus.available_modules].find(m => m.code === moduleCode) || 
                    orgStatus.active_modules.includes(moduleCode) ? 
                    (await moduleManagementService.getAllModules()).find(m => m.code === moduleCode) : null;
      
      if (!module) {
        return {
          canAccess: false,
          reason: 'Módulo no encontrado'
        };
      }

      // Verificar si el módulo está activo
      if (!orgStatus.active_modules.includes(moduleCode)) {
        return {
          canAccess: false,
          reason: 'Módulo no activado para esta organización',
          planInfo: orgStatus.plan,
          moduleInfo: module
        };
      }

      // Verificar permisos del usuario
      const hasPermissions = await this.canAccessModule(userId, organizationId, moduleCode);
      
      return {
        canAccess: hasPermissions,
        reason: hasPermissions ? undefined : 'Usuario sin permisos suficientes',
        planInfo: orgStatus.plan,
        moduleInfo: module
      };

    } catch (error) {
      console.error('Error checking module access:', error);
      return {
        canAccess: false,
        reason: 'Error interno al verificar acceso'
      };
    }
  }
};
