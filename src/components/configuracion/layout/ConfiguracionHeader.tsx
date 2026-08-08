'use client';

import { type ConfigModule } from '../config/configModulesRegistry';

interface ConfiguracionHeaderProps {
  module: ConfigModule | undefined;
}

export function ConfiguracionHeader({ module }: ConfiguracionHeaderProps) {
  if (!module) return null;

  const Icon = module.icon;

  return (
    <div className="border-b px-6 py-4 flex items-center gap-3">
      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
        <Icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{module.title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{module.description}</p>
      </div>
    </div>
  );
}
