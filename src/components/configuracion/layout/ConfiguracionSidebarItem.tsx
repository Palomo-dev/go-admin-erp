'use client';

import { type ConfigModule } from '../config/configModulesRegistry';
import { cn } from '@/lib/utils';

interface ConfiguracionSidebarItemProps {
  module: ConfigModule;
  isActive: boolean;
  onClick: () => void;
}

export function ConfiguracionSidebarItem({ module, isActive, onClick }: ConfiguracionSidebarItemProps) {
  const Icon = module.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="block truncate">{module.title}</span>
        {isActive && (
          <span className="block text-xs text-muted-foreground truncate">{module.description}</span>
        )}
      </div>
    </button>
  );
}
