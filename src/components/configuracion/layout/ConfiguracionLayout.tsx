'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfiguracionState } from '../hooks/useConfiguracionState';
import { useActiveConfigModules } from '../hooks/useActiveConfigModules';
import { CONFIG_MODULES } from '../config/configModulesRegistry';
import { ConfiguracionHeader } from './ConfiguracionHeader';
import { ConfiguracionEmpty } from './ConfiguracionEmpty';
import { ConfiguracionPanelRenderer } from './ConfiguracionPanelRenderer';

export function ConfiguracionLayout() {
  const { moduleId, currentModule, setModule } = useConfiguracionState();
  const { availableModules, loading } = useActiveConfigModules();

  const displayModules = useMemo(() => {
    return availableModules.length > 0 ? availableModules : CONFIG_MODULES;
  }, [availableModules]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 py-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="px-3 sm:px-6 py-3">
          <Skeleton className="h-10 w-full max-w-2xl" />
        </div>
        <div className="flex-1 p-3 sm:p-6 space-y-4">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (availableModules.length === 0) {
    return (
      <div className="flex h-full">
        <ConfiguracionEmpty />
      </div>
    );
  }

  const isValidModule = currentModule && displayModules.some((m) => m.id === currentModule.id);
  const effectiveModuleId = isValidModule ? moduleId : displayModules[0]?.id;
  const effectiveModule = isValidModule ? currentModule : displayModules[0];

  return (
    <div className="flex flex-col h-full">
      <ConfiguracionHeader module={effectiveModule} />

      <div className="border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 py-2">
        <Tabs value={effectiveModuleId} onValueChange={setModule}>
          <div className="overflow-x-auto">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              {displayModules.map((mod) => {
                const Icon = mod.icon;
                return (
                  <TabsTrigger
                    key={mod.id}
                    value={mod.id}
                    className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:shadow-none dark:data-[state=active]:bg-primary/20"
                  >
                    <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 transition-colors group-data-[state=active]:bg-primary">
                      <Icon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 transition-colors group-data-[state=active]:text-white" />
                    </div>
                    <span className="whitespace-nowrap text-gray-600 dark:text-gray-400 transition-colors group-data-[state=active]:text-primary dark:group-data-[state=active]:text-primary font-medium">{mod.title}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>
      </div>

      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        {effectiveModuleId ? (
          <ConfiguracionPanelRenderer moduleId={effectiveModuleId} />
        ) : (
          <ConfiguracionEmpty
            title="Módulo no encontrado"
            description="Selecciona un módulo de las pestañas superiores para ver su configuración."
          />
        )}
      </main>
    </div>
  );
}
