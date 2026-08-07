'use client';

import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfiguracionState } from '../hooks/useConfiguracionState';
import { useActiveConfigModules } from '../hooks/useActiveConfigModules';
import { CONFIG_MODULES, type ConfigModule } from '../config/configModulesRegistry';
import { ConfiguracionSidebar } from './ConfiguracionSidebar';
import { ConfiguracionHeader } from './ConfiguracionHeader';
import { ConfiguracionSearch } from './ConfiguracionSearch';
import { ConfiguracionEmpty } from './ConfiguracionEmpty';
import { ConfiguracionPanelRenderer } from './ConfiguracionPanelRenderer';

export function ConfiguracionLayout() {
  const { moduleId, currentModule, currentSection, setModule, setSection } =
    useConfiguracionState();
  const { availableModules, loading } = useActiveConfigModules();
  const [searchResults, setSearchResults] = useState<ConfigModule[] | null>(null);

  const displayModules = useMemo(() => {
    if (searchResults) return searchResults;
    return availableModules.length > 0 ? availableModules : CONFIG_MODULES;
  }, [availableModules, searchResults]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)]">
        <div className="w-64 border-r p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-8 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (availableModules.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)]">
        <ConfiguracionEmpty />
      </div>
    );
  }

  const isValidModule = currentModule && displayModules.some((m) => m.id === currentModule.id);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - hidden on mobile, visible on md+ */}
      <aside className="hidden md:flex w-64 border-r flex-col shrink-0">
        <ConfiguracionSearch
          allModules={availableModules}
          onResults={(results) => setSearchResults(results)}
        />
        <ConfiguracionSidebar
          modules={displayModules}
          activeModuleId={moduleId}
          onSelectModule={setModule}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {isValidModule ? (
          <>
            <ConfiguracionHeader
              module={currentModule}
              section={currentSection}
              sections={currentModule!.sections}
              onSectionChange={setSection}
            />
            <div className="flex-1 overflow-y-auto p-6">
              <ConfiguracionPanelRenderer moduleId={moduleId} />
            </div>
          </>
        ) : (
          <ConfiguracionEmpty
            title="Módulo no encontrado"
            description="Selecciona un módulo del panel izquierdo para ver su configuración."
          />
        )}
      </main>
    </div>
  );
}
