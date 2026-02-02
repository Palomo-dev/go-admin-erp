'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Filter,
  X,
  CalendarIcon,
  RotateCcw,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineFilters as ITimelineFilters } from '@/lib/services/timelineService';
import {
  SOURCE_CATEGORY_LABELS,
  SOURCE_TABLE_LABELS,
  ACTION_LABELS,
} from '@/lib/services/timelineService';

interface TimelineFiltersProps {
  filters: ITimelineFilters;
  onFiltersChange: (filters: ITimelineFilters) => void;
  availableTables: string[];
  availableActions: string[];
  availableEntityTypes: string[];
  loading?: boolean;
}

const DATE_PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: 'Últimos 7 días', days: 7 },
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 90 días', days: 90 },
];

export function TimelineFilters({
  filters,
  onFiltersChange,
  availableTables,
  availableActions,
  availableEntityTypes,
  loading,
}: TimelineFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const handleFilterChange = (key: keyof ITimelineFilters, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === 'all' ? undefined : value,
    });
  };

  const handleReset = () => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(new Date(), 7));
    setStartDate(start);
    setEndDate(end);
    setSearchText('');
    onFiltersChange({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  };

  const activeFiltersCount = [
    filters.sourceCategory,
    filters.sourceTable,
    filters.action,
    filters.entityType,
    filters.correlationId,
    filters.searchText,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Barra principal de búsqueda y fechas */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Búsqueda */}
        <form onSubmit={handleSearchSubmit} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar eventos (factura, usuario, entidad...)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            />
          </div>
        </form>

        {/* Selector de fechas */}
        <div className="flex items-center gap-2">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.days}
              variant="outline"
              size="sm"
              onClick={() => handleDatePreset(preset.days)}
              className={cn(
                'border-gray-300 dark:border-gray-600 text-xs',
                'hover:bg-blue-50 dark:hover:bg-blue-900/20'
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Rango de fechas personalizado */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 dark:border-gray-600"
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
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
          <span className="text-gray-500">-</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 dark:border-gray-600"
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
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

        {/* Botón filtros avanzados */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            'border-gray-300 dark:border-gray-600',
            showAdvanced && 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
          )}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filtros
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>

        {/* Botón reset */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Filtros avanzados */}
      {showAdvanced && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Categoría */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400">Categoría</Label>
              <Select
                value={filters.sourceCategory || 'all'}
                onValueChange={(value) => handleFilterChange('sourceCategory', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {Object.entries(SOURCE_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Módulo/Tabla */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400">Módulo</Label>
              <Select
                value={filters.sourceTable || 'all'}
                onValueChange={(value) => handleFilterChange('sourceTable', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los módulos</SelectItem>
                  {availableTables.map((table) => (
                    <SelectItem key={table} value={table}>
                      {SOURCE_TABLE_LABELS[table] || table}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Acción */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400">Acción</Label>
              <Select
                value={filters.action || 'all'}
                onValueChange={(value) => handleFilterChange('action', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las acciones</SelectItem>
                  {availableActions.map((action) => (
                    <SelectItem key={action} value={action}>
                      {ACTION_LABELS[action] || action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de entidad */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400">Tipo de Entidad</Label>
              <Select
                value={filters.entityType || 'all'}
                onValueChange={(value) => handleFilterChange('entityType', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {availableEntityTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Correlation ID */}
            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400">Correlation ID</Label>
              <Input
                placeholder="UUID de correlación"
                value={filters.correlationId || ''}
                onChange={(e) => handleFilterChange('correlationId', e.target.value || undefined)}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              />
            </div>

            {/* Entity ID */}
            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400">ID de Entidad</Label>
              <Input
                placeholder="ID específico de entidad"
                value={filters.entityId || ''}
                onChange={(e) => handleFilterChange('entityId', e.target.value || undefined)}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tags de filtros activos */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.sourceCategory && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Categoría: {SOURCE_CATEGORY_LABELS[filters.sourceCategory]}
              <button
                onClick={() => handleFilterChange('sourceCategory', undefined)}
                className="ml-1 hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.sourceTable && (
            <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              Módulo: {SOURCE_TABLE_LABELS[filters.sourceTable] || filters.sourceTable}
              <button
                onClick={() => handleFilterChange('sourceTable', undefined)}
                className="ml-1 hover:text-green-900"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.action && (
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              Acción: {ACTION_LABELS[filters.action] || filters.action}
              <button
                onClick={() => handleFilterChange('action', undefined)}
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
                  handleFilterChange('searchText', undefined);
                }}
                className="ml-1 hover:text-orange-900"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.correlationId && (
            <Badge variant="secondary" className="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
              Correlación: {filters.correlationId.substring(0, 8)}...
              <button
                onClick={() => handleFilterChange('correlationId', undefined)}
                className="ml-1 hover:text-cyan-900"
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
