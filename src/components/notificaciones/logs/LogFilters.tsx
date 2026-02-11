'use client';

import { Input } from '@/components/ui/input';
import { Search, Filter } from 'lucide-react';
import type { LogFilters as LogFiltersType } from './types';

interface LogFiltersProps {
  filters: LogFiltersType;
  onFiltersChange: (filters: LogFiltersType) => void;
  availableProviders: string[];
  availableChannels: string[];
}

export function LogFilters({ filters, onFiltersChange, availableProviders, availableChannels }: LogFiltersProps) {
  const update = (partial: Partial<LogFiltersType>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const selectClass = 'rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Buscar por notification_id..."
          className="pl-8 h-8 text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-gray-400" />

        <select value={filters.status} onChange={(e) => update({ status: e.target.value })} className={selectClass}>
          <option value="all">Todos los estados</option>
          <option value="success">Exitoso</option>
          <option value="fail">Fallido</option>
          <option value="pending">Pendiente</option>
          <option value="bounced">Rebotado</option>
        </select>

        <select value={filters.channel} onChange={(e) => update({ channel: e.target.value })} className={selectClass}>
          <option value="all">Todos los canales</option>
          {availableChannels.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>

        <select value={filters.provider} onChange={(e) => update({ provider: e.target.value })} className={selectClass}>
          <option value="all">Todos los providers</option>
          {availableProviders.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          className={selectClass}
          title="Desde"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          className={selectClass}
          title="Hasta"
        />
      </div>
    </div>
  );
}
