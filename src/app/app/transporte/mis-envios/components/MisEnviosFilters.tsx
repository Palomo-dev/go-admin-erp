'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Calendar } from 'lucide-react';

export type DateFilterPreset = 'today' | 'yesterday' | '7days' | '15days' | '30days' | 'custom' | 'all';

const statusOptions = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'assigned', label: 'Asignado' },
  { value: 'ready', label: 'Listo' },
  { value: 'picked', label: 'Recogido' },
  { value: 'dispatched', label: 'Despachado' },
  { value: 'in_transit', label: 'En tránsito' },
  { value: 'out_for_delivery', label: 'En entrega' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'failed', label: 'Fallido' },
  { value: 'returned', label: 'Devuelto' },
  { value: 'cancelled', label: 'Cancelado' },
];

interface MisEnviosFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  dateFilter: DateFilterPreset;
  onDateFilterChange: (value: DateFilterPreset) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

const dateFilterOptions: { value: DateFilterPreset; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7days', label: '7 días' },
  { value: '15days', label: '15 días' },
  { value: '30days', label: '30 días' },
  { value: 'custom', label: 'Personalizado' },
];

export function MisEnviosFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  dateFilter,
  onDateFilterChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: MisEnviosFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <Input
            placeholder="Buscar por número, dirección, cliente..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">Fecha:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {dateFilterOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={dateFilter === opt.value ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => onDateFilterChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {dateFilter === 'custom' && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Desde:</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-[160px] h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Hasta:</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-[160px] h-9"
            />
          </div>
        </div>
      )}
    </div>
  );
}
