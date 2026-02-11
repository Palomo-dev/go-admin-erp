'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, Filter } from 'lucide-react';
import type { AlertFilters } from './types';
import { DEFAULT_ALERT_FILTERS } from './types';

interface AlertaFiltersProps {
  filters: AlertFilters;
  onChange: (filters: AlertFilters) => void;
  availableModules: string[];
}

const severityOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Crítica' },
];

const statusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'delivered', label: 'Entregada' },
  { value: 'read', label: 'Leída' },
  { value: 'resolved', label: 'Resuelta' },
  { value: 'ignored', label: 'Ignorada' },
];

const moduleLabels: Record<string, string> = {
  inventario: 'Inventario',
  finanzas: 'Finanzas',
  pos: 'POS',
  crm: 'CRM',
  hrm: 'HRM',
  pms: 'PMS',
  sistema: 'Sistema',
  integraciones: 'Integraciones',
  transporte: 'Transporte',
};

export function AlertaFilters({ filters, onChange, availableModules }: AlertaFiltersProps) {
  const hasActiveFilters =
    filters.severity !== 'all' ||
    filters.status !== 'all' ||
    filters.source_module !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.search !== '';

  const update = (partial: Partial<AlertFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por título o mensaje..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_ALERT_FILTERS)}
            className="text-gray-500 hover:text-red-500"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />

        <FilterSelect
          value={filters.severity}
          options={severityOptions}
          onChange={(v) => update({ severity: v })}
        />

        <FilterSelect
          value={filters.status}
          options={statusOptions}
          onChange={(v) => update({ status: v })}
        />

        <FilterSelect
          value={filters.source_module}
          options={[
            { value: 'all', label: 'Módulo: Todos' },
            ...availableModules.map((m) => ({
              value: m,
              label: moduleLabels[m] || m.charAt(0).toUpperCase() + m.slice(1),
            })),
          ]}
          onChange={(v) => update({ source_module: v })}
        />

        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          className="h-8 px-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          title="Desde"
        />
        <span className="text-xs text-gray-400">—</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          className="h-8 px-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          title="Hasta"
        />
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
