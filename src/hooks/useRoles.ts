import { useState, useEffect, useCallback, useRef } from 'react';
import { roleService, Role, RoleWithPermissions, Permission } from '@/lib/services/roleService';
import { permissionService, ModulePermissions } from '@/lib/services/permissionService';
import { supabase } from '@/lib/supabase/config';
import { toast } from 'react-hot-toast';
import { usePageVisibility } from './usePageVisibility';

export interface UseRolesReturn {
  // Estados
  roles: RoleWithPermissions[];
  loading: boolean;
  error: string | null;
  
  // Funciones de gestión de roles
  createRole: (roleData: Omit<Role, 'id' | 'created_at' | 'is_system'>) => Promise<Role | null>;
  updateRole: (roleId: number, roleData: Partial<Role>) => Promise<Role | null>;
  deleteRole: (roleId: number) => Promise<boolean>;
  cloneRole: (roleId: number, newName: string) => Promise<Role | null>;
  
  // Funciones de permisos
  setRolePermissions: (roleId: number, permissionIds: number[]) => Promise<boolean>;
  getRolePermissions: (roleId: number) => Promise<Permission[]>;
  
  // Utilidades
  refreshRoles: () => Promise<void>;
  getRoleById: (roleId: number) => RoleWithPermissions | undefined;
}

export const useRoles = (organizationId: number): UseRolesReturn => {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoadTime = useRef<number>(0);
  const isInitialLoad = useRef(true);
  
  // Hook para detectar visibilidad de la página
  const { isVisible, wasHidden } = usePageVisibility();

  // Cargar roles
  const loadRoles = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (loadingRef.current) {
      return;
    }

    const now = Date.now();
    
    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      const data = await roleService.getRoles(organizationId);
      setRoles(data);
      lastLoadTime.current = now;
      isInitialLoad.current = false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar roles';
      setError(errorMessage);
      console.error('Error loading roles:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [organizationId, wasHidden]);

  // Cargar roles al inicializar con debounce
  useEffect(() => {
    if (!organizationId) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the loading to prevent rapid successive calls
    timeoutRef.current = setTimeout(() => {
      loadRoles();
    }, 150);

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [organizationId, loadRoles]);

  // Crear rol
  const createRole = useCallback(async (roleData: Omit<Role, 'id' | 'created_at' | 'is_system'>): Promise<Role | null> => {
    try {
      const newRole = await roleService.createRole({
        ...roleData,
        organization_id: organizationId
      });
      
      toast.success('Rol creado exitosamente');
      await loadRoles(); // Recargar lista
      return newRole;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear rol';
      toast.error(errorMessage);
      console.error('Error creating role:', err);
      return null;
    }
  }, [organizationId, loadRoles]);

  // Actualizar rol
  const updateRole = useCallback(async (roleId: number, roleData: Partial<Role>): Promise<Role | null> => {
    try {
      const updatedRole = await roleService.updateRole(roleId, roleData);
      
      toast.success('Rol actualizado exitosamente');
      await loadRoles(); // Recargar lista
      return updatedRole;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar rol';
      toast.error(errorMessage);
      console.error('Error updating role:', err);
      return null;
    }
  }, [loadRoles]);

  // Eliminar rol
  const deleteRole = useCallback(async (roleId: number): Promise<boolean> => {
    try {
      await roleService.deleteRole(roleId);
      
      toast.success('Rol eliminado exitosamente');
      await loadRoles(); // Recargar lista
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al eliminar rol';
      toast.error(errorMessage);
      console.error('Error deleting role:', err);
      return false;
    }
  }, [loadRoles]);

  // Clonar rol
  const cloneRole = useCallback(async (roleId: number, newName: string): Promise<Role | null> => {
    try {
      const clonedRole = await roleService.cloneRole(roleId, newName, organizationId);
      
      toast.success('Rol clonado exitosamente');
      await loadRoles(); // Recargar lista
      return clonedRole;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al clonar rol';
      toast.error(errorMessage);
      console.error('Error cloning role:', err);
      return null;
    }
  }, [organizationId, loadRoles]);

  // Asignar permisos a rol
  const setRolePermissions = useCallback(async (roleId: number, permissionIds: number[]): Promise<boolean> => {
    try {
      await roleService.setRolePermissions(roleId, permissionIds);
      
      toast.success('Permisos actualizados exitosamente');
      await loadRoles(); // Recargar lista para actualizar conteos
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar permisos';
      toast.error(errorMessage);
      console.error('Error setting role permissions:', err);
      return false;
    }
  }, [loadRoles]);

  // Obtener permisos de un rol
  const getRolePermissions = useCallback(async (roleId: number): Promise<Permission[]> => {
    try {
      return await roleService.getRolePermissions(roleId);
    } catch (err) {
      console.error('Error getting role permissions:', err);
      return [];
    }
  }, []);

  // Refrescar roles
  const refreshRoles = useCallback(async () => {
    await loadRoles();
  }, [loadRoles]);

  // Obtener rol por ID
  const getRoleById = useCallback((roleId: number): RoleWithPermissions | undefined => {
    return roles.find(role => role.id === roleId);
  }, [roles]);

  return {
    // Estados
    roles,
    loading,
    error,
    
    // Funciones de gestión de roles
    createRole,
    updateRole,
    deleteRole,
    cloneRole,
    
    // Funciones de permisos
    setRolePermissions,
    getRolePermissions,
    
    // Utilidades
    refreshRoles,
    getRoleById
  };
};

export interface UsePermissionsReturn {
  // Estados
  permissions: ModulePermissions[];
  loading: boolean;
  error: string | null;
  
  // Funciones
  getModulePermissions: (moduleCode: string) => Permission[];
  searchPermissions: (searchTerm: string) => Promise<Permission[]>;
  refreshPermissions: () => Promise<void>;
}

export const usePermissions = (): UsePermissionsReturn => {
  const [permissions, setPermissions] = useState<ModulePermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar permisos
  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await permissionService.getPermissionsByModule();
      setPermissions(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar permisos';
      setError(errorMessage);
      console.error('Error loading permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar permisos al inicializar
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Obtener permisos de un módulo específico
  const getModulePermissions = useCallback((moduleCode: string): Permission[] => {
    const moduleData = permissions.find(p => p.module === moduleCode);
    return moduleData?.permissions || [];
  }, [permissions]);

  // Buscar permisos
  const searchPermissions = useCallback(async (searchTerm: string): Promise<Permission[]> => {
    try {
      return await permissionService.searchPermissions(searchTerm);
    } catch (err) {
      console.error('Error searching permissions:', err);
      return [];
    }
  }, []);

  // Refrescar permisos
  const refreshPermissions = useCallback(async () => {
    await loadPermissions();
  }, [loadPermissions]);

  return {
    // Estados
    permissions,
    loading,
    error,
    
    // Funciones
    getModulePermissions,
    searchPermissions,
    refreshPermissions
  };
};

export interface UseUserPermissionsReturn {
  // Estados
  userPermissions: Permission[];
  accessibleModules: string[];
  loading: boolean;
  
  // Funciones de verificación
  hasPermission: (permissionCode: string) => boolean;
  canAccessModule: (moduleCode: string) => boolean;
  checkMultiplePermissions: (permissionCodes: string[]) => {[key: string]: boolean};
  
  // Utilidades
  refreshUserPermissions: () => Promise<void>;
}

export const useUserPermissions = (userId: string, organizationId: number): UseUserPermissionsReturn => {
  const [userPermissions, setUserPermissions] = useState<Permission[]>([]);
  const [accessibleModules, setAccessibleModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar permisos del usuario usando la función SQL get_user_permissions
  const loadUserPermissions = useCallback(async () => {
    if (!userId || !organizationId) return;

    try {
      setLoading(true);
      
      // Usar la función SQL que resuelve permisos de todas las capas
      const { data, error } = await supabase.rpc('get_user_permissions', {
        p_user_id: userId,
        p_organization_id: organizationId
      });

      if (error) throw error;

      // Convertir resultado a formato Permission[]
      const permissions: Permission[] = (data || []).map((p: any) => ({
        id: 0, // No necesitamos el ID real
        code: p.permission_code,
        name: p.permission_name,
        module: p.module,
        category: p.category,
        description: ''
      }));

      setUserPermissions(permissions);
      
      // Extraer módulos únicos
      const modules = Array.from(new Set(permissions.map(p => p.module)));
      setAccessibleModules(modules);
    } catch (err) {
      console.error('Error loading user permissions:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, organizationId]);

  // Cargar permisos al inicializar
  useEffect(() => {
    loadUserPermissions();
  }, [loadUserPermissions]);

  // Verificar si tiene un permiso específico
  const hasPermission = useCallback((permissionCode: string): boolean => {
    return userPermissions.some(permission => permission.code === permissionCode);
  }, [userPermissions]);

  // Verificar si puede acceder a un módulo
  const canAccessModule = useCallback((moduleCode: string): boolean => {
    return accessibleModules.includes(moduleCode);
  }, [accessibleModules]);

  // Verificar múltiples permisos
  const checkMultiplePermissions = useCallback((permissionCodes: string[]): {[key: string]: boolean} => {
    const result: {[key: string]: boolean} = {};
    permissionCodes.forEach(code => {
      result[code] = hasPermission(code);
    });
    return result;
  }, [hasPermission]);

  // Refrescar permisos del usuario
  const refreshUserPermissions = useCallback(async () => {
    await loadUserPermissions();
  }, [loadUserPermissions]);

  return {
    // Estados
    userPermissions,
    accessibleModules,
    loading,
    
    // Funciones de verificación
    hasPermission,
    canAccessModule,
    checkMultiplePermissions,
    
    // Utilidades
    refreshUserPermissions
  };
};
