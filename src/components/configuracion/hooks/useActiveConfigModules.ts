'use client';

import { useMemo } from 'react';
import { useActiveModules } from '@/hooks/useActiveModules';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { CONFIG_MODULES, type ConfigModule } from '../config/configModulesRegistry';

interface UseActiveConfigModulesReturn {
  availableModules: ConfigModule[];
  loading: boolean;
  error: string | null;
  isModuleActive: (moduleCode: string) => boolean;
}

export function useActiveConfigModules(): UseActiveConfigModulesReturn {
  const organizationId = getOrganizationId();
  const { organizationStatus, loading, error } = useActiveModules(organizationId);

  const availableModules = useMemo(() => {
    return CONFIG_MODULES.filter((mod) => {
      if (mod.isCore) return true;
      if (!organizationStatus) return false;
      return organizationStatus.active_modules.includes(mod.moduleCode);
    });
  }, [organizationStatus]);

  const isModuleActive = useMemo(() => {
    return (moduleCode: string) => {
      const mod = CONFIG_MODULES.find((m) => m.moduleCode === moduleCode);
      if (mod?.isCore) return true;
      if (!organizationStatus) return false;
      return organizationStatus.active_modules.includes(moduleCode);
    };
  }, [organizationStatus]);

  return {
    availableModules,
    loading,
    error,
    isModuleActive,
  };
}
