'use client';

import { Input } from '@/components/ui/input';
import { Search, Filter } from 'lucide-react';
import type { RuleFilters } from './types';
import { SOURCE_MODULES } from './types';

interface ReglaFiltersProps {
  filters: RuleFilters;
  onFiltersChange: (filters: RuleFilters) => void;
  availableModules: string[];
}

export function ReglaFilters({ filters, onFiltersChange, availableModules }: ReglaFiltersProps) {
  const update = (partial: Partial<RuleFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const selectClass = 'rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Buscar reglas..."
          className="pl-8 h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-gray-400" />

        <select
          value={filters.severity}
          onChange={(e) => update({ severity: e.target.value })}
          className={selectClass}
        >
          <option value="all">Todas las severidades</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Crítica</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          className={selectClass}
        >
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>

        <select
          value={filters.source_module}
          onChange={(e) => update({ source_module: e.target.value })}
          className={selectClass}
        >
          <option value="all">Todos los módulos</option>
          {availableModules.map((mod) => {
            const label = SOURCE_MODULES.find((m) => m.value === mod)?.label || mod;
            return <option key={mod} value={mod}>{label}</option>;
          })}
        </select>
      </div>
    </div>
  );
}
