'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { CONFIG_MODULES, getConfigModule, getDefaultSection, type ConfigModule, type ConfigSection } from '../config/configModulesRegistry';

interface UseConfiguracionStateReturn {
  moduleId: string;
  sectionId: string;
  currentModule: ConfigModule | undefined;
  currentSection: ConfigSection | undefined;
  setModule: (moduleId: string) => void;
  setSection: (sectionId: string) => void;
}

export function useConfiguracionState(): UseConfiguracionStateReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const moduleId = useMemo(() => {
    const param = searchParams.get('modulo');
    if (param && getConfigModule(param)) return param;
    return CONFIG_MODULES[0]?.id ?? 'crm';
  }, [searchParams]);

  const sectionId = useMemo(() => {
    const param = searchParams.get('seccion');
    if (param) {
      const mod = getConfigModule(moduleId);
      if (mod?.sections.some((s) => s.id === param)) return param;
    }
    return getDefaultSection(moduleId);
  }, [searchParams, moduleId]);

  const currentModule = useMemo(() => getConfigModule(moduleId), [moduleId]);
  const currentSection = useMemo(
    () => currentModule?.sections.find((s) => s.id === sectionId),
    [currentModule, sectionId]
  );

  const updateParams = useCallback(
    (newModule: string, newSection: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('modulo', newModule);
      params.set('seccion', newSection);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const setModule = useCallback(
    (newModuleId: string) => {
      const defaultSec = getDefaultSection(newModuleId);
      updateParams(newModuleId, defaultSec);
    },
    [updateParams]
  );

  const setSection = useCallback(
    (newSectionId: string) => {
      updateParams(moduleId, newSectionId);
    },
    [updateParams, moduleId]
  );

  return {
    moduleId,
    sectionId,
    currentModule,
    currentSection,
    setModule,
    setSection,
  };
}
