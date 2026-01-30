'use client';

import { Search, X, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES, type AuditFilters } from '@/lib/services/chatAuditService';

interface AuditFiltersProps {
  filters: AuditFilters;
  onFiltersChange: (filters: AuditFilters) => void;
  onClearFilters: () => void;
}

export default function AuditFiltersComponent({
  filters,
  onFiltersChange,
  onClearFilters
}: AuditFiltersProps) {
  const hasFilters = filters.action || filters.entityType || filters.actorType || filters.dateFrom || filters.dateTo || filters.search;

  const handleDateFromChange = (date: Date | undefined) => {
    onFiltersChange({
      ...filters,
      dateFrom: date ? date.toISOString() : undefined
    });
  };

  const handleDateToChange = (date: Date | undefined) => {
    onFiltersChange({
      ...filters,
      dateTo: date ? date.toISOString() : undefined
    });
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={filters.search || ''}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
              placeholder="Buscar en logs..."
              className="pl-10 bg-white dark:bg-gray-800"
            />
          </div>

          <Select
            value={filters.action || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, action: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-full sm:w-[200px] bg-white dark:bg-gray-800">
              <SelectValue placeholder="Acción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las acciones</SelectItem>
              {AUDIT_ACTIONS.map((action) => (
                <SelectItem key={action.value} value={action.value}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.entityType || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, entityType: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-800">
              <SelectValue placeholder="Entidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las entidades</SelectItem>
              {ENTITY_TYPES.map((entity) => (
                <SelectItem key={entity.value} value={entity.value}>
                  {entity.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.actorType || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, actorType: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-full sm:w-[150px] bg-white dark:bg-gray-800">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {ACTOR_TYPES.map((actor) => (
                <SelectItem key={actor.value} value={actor.value}>
                  {actor.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Desde:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[150px] justify-start text-left font-normal bg-white dark:bg-gray-800"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {filters.dateFrom ? format(new Date(filters.dateFrom), 'dd/MM/yyyy') : 'Fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                  onSelect={handleDateFromChange}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Hasta:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[150px] justify-start text-left font-normal bg-white dark:bg-gray-800"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {filters.dateTo ? format(new Date(filters.dateTo), 'dd/MM/yyyy') : 'Fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                  onSelect={handleDateToChange}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-gray-500"
            >
              <X className="h-4 w-4 mr-1" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
