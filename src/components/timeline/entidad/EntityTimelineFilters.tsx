'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import {
  Search,
  CalendarIcon,
  X,
  RotateCcw,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ACTION_LABELS } from '@/lib/services/timelineService';

export interface EntityFilters {
  startDate: string;
  endDate: string;
  action?: string;
  actorId?: string;
  searchText?: string;
}

interface EntityTimelineFiltersProps {
  filters: EntityFilters;
  onFiltersChange: (filters: EntityFilters) => void;
  availableActions: string[];
}

const DATE_PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
  { label: 'Todo', days: 365 * 5 },
];

export function EntityTimelineFilters({
  filters,
  onFiltersChange,
  availableActions,
}: EntityTimelineFiltersProps) {
  const [searchText, setSearchText] = useState(filters.searchText || '');
  const [startDate, setStartDate] = useState<Date>(new Date(filters.startDate));
  const [endDate, setEndDate] = useState<Date>(new Date(filters.endDate));

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFiltersChange({ ...filters, searchText });
  };

  const handleDatePreset = (days: number) => {
    const end = endOfDay(new Date());
    const start = startOfDay(days === 0 ? new Date() : subDays(new Date(), days));
    setStartDate(start);
    setEndDate(end);
    onFiltersChange({
      ...filters,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  };

  const handleStartDateChange = (date: Date | undefined) => {
    if (date) {
      setStartDate(date);
      onFiltersChange({
        ...filters,
        startDate: startOfDay(date).toISOString(),
      });
    }
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (date) {
      setEndDate(date);
      onFiltersChange({
        ...filters,
        endDate: endOfDay(date).toISOString(),
      });
    }
  };

  const handleActionChange = (value: string) => {
    onFiltersChange({
      ...filters,
      action: value === 'all' ? undefined : value,
    });
  };

  const handleReset = () => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), 365 * 5)); // Todo el historial
    setStartDate(start);
    setEndDate(end);
    setSearchText('');
    onFiltersChange({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  };

  const activeFiltersCount = [
    filters.action,
    filters.searchText,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Fila principal */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Búsqueda */}
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar en el historial..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            />
          </div>
        </form>

        {/* Presets de fecha */}
        <div className="flex items-center gap-1">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.days}
              variant="ghost"
              size="sm"
              onClick={() => handleDatePreset(preset.days)}
              className={cn(
                'text-xs px-2',
                'hover:bg-blue-50 dark:hover:bg-blue-900/20'
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Rango de fechas */}
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 dark:border-gray-600 text-xs"
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {format(startDate, 'dd/MM/yy', { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={handleStartDateChange}
                locale={es}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-gray-400 text-xs">-</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 dark:border-gray-600 text-xs"
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {format(endDate, 'dd/MM/yy', { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={handleEndDateChange}
                locale={es}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Filtro de acción */}
        <Select
          value={filters.action || 'all'}
          onValueChange={handleActionChange}
        >
          <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {availableActions.map((action) => (
              <SelectItem key={action} value={action}>
                {ACTION_LABELS[action] || action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Botón reset */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Tags de filtros activos */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.action && (
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              Acción: {ACTION_LABELS[filters.action] || filters.action}
              <button
                onClick={() => handleActionChange('all')}
                className="ml-1 hover:text-purple-900"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.searchText && (
            <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
              Búsqueda: "{filters.searchText}"
              <button
                onClick={() => {
                  setSearchText('');
                  onFiltersChange({ ...filters, searchText: undefined });
                }}
                className="ml-1 hover:text-orange-900"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
