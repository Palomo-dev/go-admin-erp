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
   */
  async checkUserPermission(
    userId: string, 
    organizationId: number, 
    permissionCode: string
  ): Promise<UserPermissionCheck> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        is_super_admin,
        role_id,
        roles!inner(
          name,
          role_permissions!inner(
            permissions!inner(code)
          )
        )
      `)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      return {
        hasPermission: false,
        isSuperAdmin: false
      };
    }

    // Si es super admin, tiene todos los permisos
    if (data.is_super_admin) {
      return {
        hasPermission: true,
        isSuperAdmin: true,
        roleId: data.role_id,
        roleName: data.roles?.name
      };
    }

    // Verificar permisos específicos del rol
    const hasPermission = data.roles?.role_permissions?.some(rp => 
      rp.permissions?.code === permissionCode
    ) || false;

    return {
      hasPermission,
      isSuperAdmin: false,
      roleId: data.role_id,
      roleName: data.roles?.name
    };
  },

  /**
   * Verificar múltiples permisos de un usuario
   */
  async checkMultiplePermissions(
    userId: string,
    organizationId: number,
    permissionCodes: string[]
  ): Promise<{[permissionCode: string]: boolean}> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        is_super_admin,
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
    
    if (error || !data) {
      return permissionCodes.reduce((acc, code) => {
        acc[code] = false;
        return acc;
      }, {} as {[key: string]: boolean});
    }

    // Si es super admin, tiene todos los permisos
    if (data.is_super_admin) {
      return permissionCodes.reduce((acc, code) => {
        acc[code] = true;
        return acc;
      }, {} as {[key: string]: boolean});
    }

    // Obtener permisos del rol
    const userPermissions = data.roles?.role_permissions?.map(rp => rp.permissions?.code).filter(Boolean) || [];

    // Verificar cada permiso solicitado
    return permissionCodes.reduce((acc, code) => {
      acc[code] = userPermissions.includes(code);
      return acc;
    }, {} as {[key: string]: boolean});
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
      return await this.getAllPermissions();
    }

    // Obtener permisos específicos del rol
    const permissions = data.roles?.role_permissions?.map(rp => rp.permissions).filter(Boolean) || [];
    return permissions;
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
    (rolePermissions || []).forEach(rp => {
      if (rp.permissions) {
        const id = rp.permission_id;
        if (!permissionUsage[id]) {
          permissionUsage[id] = {
            permission: rp.permissions,
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
