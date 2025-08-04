'use client';

import { useMemo } from 'react';
import { useActiveModules } from '@/hooks/useActiveModules';

interface OptimizedModulesReturn {
  coreModules: any[];
  paidModules: any[];
  canAccessModule: (moduleCode: string) => boolean;
  loading: boolean;
  error: any;
}

export const useOptimizedModules = (organizationId?: number): OptimizedModulesReturn => {
  const { 
    activeModules, 
    canAccessModule: originalCanAccess, 
    loading, 
    error 
  } = useActiveModules(organizationId);

  // Memoizar la separación de módulos core y pagados
  const { coreModules, paidModules } = useMemo(() => {
    const core = activeModules.filter(m => m.is_core);
    const paid = activeModules.filter(m => !m.is_core);
    
    return { coreModules: core, paidModules: paid };
  }, [activeModules]);

  // Función optimizada para verificar acceso que siempre permite módulos core
  const canAccessModule = useMemo(() => {
    return (moduleCode: string): boolean => {
      // Los módulos core siempre son accesibles
      const module = activeModules.find(m => m.code === moduleCode);
      if (module?.is_core) {
        return true;
      }
      
      // Para módulos pagados, usar la función original
      return originalCanAccess(moduleCode);
    };
  }, [activeModules, originalCanAccess]);

  return {
    coreModules,
    paidModules,
    canAccessModule,
    loading,
    error
  };
};
