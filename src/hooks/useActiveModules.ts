'use client';

import { useState, useEffect, useCallback } from 'react';
import { moduleManagementService, type Module, type OrganizationModuleStatus } from '@/lib/services/moduleManagementService';
import { permissionService } from '@/lib/services/permissionService';
import { useSession } from '@/lib/context/SessionContext';

interface UseActiveModulesReturn {
  activeModules: Module[];
  organizationStatus: OrganizationModuleStatus | null;
  accessibleModules: string[];
  loading: boolean;
  error: string | null;
  canAccessModule: (moduleCode: string) => boolean;
  hasModulePermission: (moduleCode: string, permissionCode: string) => Promise<boolean>;
  refreshModules: () => Promise<void>;
}

export function useActiveModules(organizationId?: number): UseActiveModulesReturn {
  const [activeModules, setActiveModules] = useState<Module[]>([]);
  const [organizationStatus, setOrganizationStatus] = useState<OrganizationModuleStatus | null>(null);
  const [accessibleModules, setAccessibleModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { session } = useSession();
  const user = session?.user;
  
  // TODO: Implementar context de organización - por ahora usar organizationId requerido
  const currentOrgId = organizationId;
  
  if (!organizationId) {
    console.warn('useActiveModules: organizationId is required');
  }

  const loadModules = useCallback(async () => {
    if (!currentOrgId || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Cargar módulos activos
      const [modules, orgStatus, userAccessibleModules] = await Promise.all([
        moduleManagementService.getActiveModules(currentOrgId),
        moduleManagementService.getOrganizationModuleStatus(currentOrgId),
        permissionService.getUserAccessibleModules(user.id, currentOrgId)
      ]);

      setActiveModules(modules);
      setOrganizationStatus(orgStatus);
      setAccessibleModules(userAccessibleModules);

    } catch (err) {
      console.error('Error loading modules:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [currentOrgId, user?.id]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const canAccessModule = useCallback((moduleCode: string): boolean => {
    if (!organizationStatus) return false;
    
    // Verificar si el módulo está activo para la organización
    const isActive = organizationStatus.active_modules.includes(moduleCode);
    
    // Verificar si el usuario tiene acceso al módulo
    const hasUserAccess = accessibleModules.includes(moduleCode);
    
    return isActive && hasUserAccess;
  }, [organizationStatus, accessibleModules]);

  const hasModulePermission = useCallback(async (moduleCode: string, permissionCode: string): Promise<boolean> => {
    if (!user?.id || !currentOrgId) return false;
    
    try {
      // Primero verificar si puede acceder al módulo
      if (!canAccessModule(moduleCode)) return false;
      
      // Luego verificar el permiso específico
      const permissionCheck = await permissionService.checkUserPermission(
        user.id, 
        currentOrgId, 
        permissionCode
      );
      
      return permissionCheck.hasPermission;
    } catch (error) {
      console.error('Error checking module permission:', error);
      return false;
    }
  }, [user?.id, currentOrgId, canAccessModule]);

  const refreshModules = useCallback(async () => {
    await loadModules();
  }, [loadModules]);

  return {
    activeModules,
    organizationStatus,
    accessibleModules,
    loading,
    error,
    canAccessModule,
    hasModulePermission,
    refreshModules
  };
}

// Hook específico para verificar acceso a un módulo individual
export function useModuleAccess(moduleCode: string, organizationId?: number) {
  const { canAccessModule, hasModulePermission, loading } = useActiveModules(organizationId);
  
  const canAccess = canAccessModule(moduleCode);
  
  return {
    canAccess,
    loading,
    hasPermission: (permissionCode: string) => hasModulePermission(moduleCode, permissionCode)
  };
}

// Hook para obtener información detallada de acceso a módulos
export function useModuleAccessInfo(moduleCode: string, organizationId?: number) {
  const [accessInfo, setAccessInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const { session } = useSession();
  const user = session?.user;
  const currentOrgId = organizationId;

  useEffect(() => {
    const loadAccessInfo = async () => {
      if (!user?.id || !currentOrgId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const info = await permissionService.checkModuleAccessWithPlanInfo(
          user.id,
          currentOrgId,
          moduleCode
        );
        setAccessInfo(info);
      } catch (error) {
        console.error('Error loading module access info:', error);
        setAccessInfo({
          canAccess: false,
          reason: 'Error al cargar información de acceso'
        });
      } finally {
        setLoading(false);
      }
    };

    loadAccessInfo();
  }, [user?.id, currentOrgId, moduleCode]);

  return {
    accessInfo,
    loading,
    canAccess: accessInfo?.canAccess || false,
    reason: accessInfo?.reason,
    planInfo: accessInfo?.planInfo,
    moduleInfo: accessInfo?.moduleInfo
  };
}
