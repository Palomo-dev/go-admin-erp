'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { CONFIG_MODULES, getConfigModule, type ConfigModule } from '../config/configModulesRegistry';

interface UseConfiguracionStateReturn {
  moduleId: string;
  currentModule: ConfigModule | undefined;
  setModule: (moduleId: string) => void;
}

export function useConfiguracionState(): UseConfiguracionStateReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const moduleId = useMemo(() => {
    const param = searchParams.get('modulo');
    if (param && getConfigModule(param)) return param;
    const firstCore = CONFIG_MODULES.find((m) => m.isCore);
    return firstCore?.id ?? CONFIG_MODULES[0]?.id ?? 'general';
  }, [searchParams]);

  const currentModule = useMemo(() => getConfigModule(moduleId), [moduleId]);

  const setModule = useCallback(
    (newModuleId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('modulo', newModuleId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  return {
    moduleId,
    currentModule,
    setModule,
  };
}
