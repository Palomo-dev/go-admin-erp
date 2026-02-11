'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, Filter } from 'lucide-react';
import type { BandejaFilters } from './types';
import { DEFAULT_FILTERS } from './types';

interface NotificationFiltersProps {
  filters: BandejaFilters;
  onChange: (filters: BandejaFilters) => void;
  availableTypes: string[];
}

const statusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'sent', label: 'Enviada' },
  { value: 'delivered', label: 'Entregada' },
  { value: 'failed', label: 'Fallida' },
];

const channelOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
];

const readOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'No leídas' },
  { value: 'read', label: 'Leídas' },
];

const typeLabels: Record<string, string> = {
  ar_overdue: 'CxC vencida',
  ap_overdue: 'CxP vencida',
  purchase_invoice_created: 'Factura compra',
  payment_registered: 'Pago',
  reservation_created: 'Reserva',
  checkin: 'Check-in',
  checkout: 'Check-out',
  stock_low: 'Stock bajo',
  stock_out: 'Sin stock',
  task_assigned: 'Tarea asignada',
  task_completed: 'Tarea completada',
  calendar_event_assigned: 'Evento',
  role_changed: 'Cambio de rol',
  new_member: 'Nuevo miembro',
};

export function NotificationFilters({ filters, onChange, availableTypes }: NotificationFiltersProps) {
  const hasActiveFilters =
    filters.readStatus !== 'all' ||
    filters.status !== 'all' ||
    filters.channel !== 'all' ||
    filters.type !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.search !== '';

  const update = (partial: Partial<BandejaFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      {/* Barra de búsqueda */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por título o contenido..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-gray-500 hover:text-red-500"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Fila de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />

        {/* Lectura */}
        <FilterSelect
          value={filters.readStatus}
          options={readOptions}
          onChange={(v) => update({ readStatus: v as BandejaFilters['readStatus'] })}
        />

        {/* Estado */}
        <FilterSelect
          value={filters.status}
          options={statusOptions}
          onChange={(v) => update({ status: v })}
        />

        {/* Canal */}
        <FilterSelect
          value={filters.channel}
          options={channelOptions}
          onChange={(v) => update({ channel: v })}
        />

        {/* Tipo */}
        <FilterSelect
          value={filters.type}
          options={[
            { value: 'all', label: 'Tipo: Todos' },
            ...availableTypes.map((t) => ({
              value: t,
              label: typeLabels[t] || t.replace(/_/g, ' '),
            })),
          ]}
          onChange={(v) => update({ type: v })}
        />

        {/* Fechas */}
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
