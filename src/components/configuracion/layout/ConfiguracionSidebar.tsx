'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { type ConfigModule } from '../config/configModulesRegistry';
import { ConfiguracionSidebarItem } from './ConfiguracionSidebarItem';

interface ConfiguracionSidebarProps {
  modules: ConfigModule[];
  activeModuleId: string;
  onSelectModule: (moduleId: string) => void;
}

export function ConfiguracionSidebar({ modules, activeModuleId, onSelectModule }: ConfiguracionSidebarProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Módulos
        </p>
      </div>
      <ScrollArea className="flex-1">
        <nav className="px-2 pb-4 space-y-1">
          {modules.map((module) => (
            <ConfiguracionSidebarItem
              key={module.id}
              module={module}
              isActive={module.id === activeModuleId}
              onClick={() => onSelectModule(module.id)}
            />
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}
