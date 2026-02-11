'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import type { TemplateFilters } from './types';
import { DEFAULT_TEMPLATE_FILTERS, CHANNEL_OPTIONS } from './types';

interface PlantillaFiltersProps {
  filters: TemplateFilters;
  onChange: (filters: TemplateFilters) => void;
}

export function PlantillaFilters({ filters, onChange }: PlantillaFiltersProps) {
  const hasActive = filters.channel !== 'all' || filters.search !== '';

  const update = (partial: Partial<TemplateFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o asunto..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          />
        </div>

        <select
          value={filters.channel}
          onChange={(e) => update({ channel: e.target.value })}
          className="h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 cursor-pointer focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos los canales</option>
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_TEMPLATE_FILTERS)}
            className="text-gray-500 hover:text-red-500"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
