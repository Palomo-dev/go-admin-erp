'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search,
  Filter,
  X,
  CalendarIcon,
  Download,
  Upload,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { OpportunityFilters, Pipeline, Stage, Customer } from './types';

interface OpportunitiesFiltersProps {
  filters: OpportunityFilters;
  onFiltersChange: (filters: OpportunityFilters) => void;
  pipelines: Pipeline[];
  stages: Stage[];
  customers: Customer[];
  onNewOpportunity: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export function OpportunitiesFilters({
  filters,
  onFiltersChange,
  pipelines,
  stages,
  customers,
  onNewOpportunity,
  onExport,
  onImport,
}: OpportunitiesFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  const filteredStages = filters.pipelineId
    ? stages.filter((s) => s.pipeline_id === filters.pipelineId)
    : stages;

  const handleClearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters =
    filters.pipelineId ||
    filters.stageId ||
    filters.status ||
    filters.customerId ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.search;

  return (
    <div className="space-y-4">
      {/* Barra principal */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar oportunidades..."
              value={filters.search || ''}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="pl-9 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'border-gray-200 dark:border-gray-700',
              showFilters && 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
            )}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {hasActiveFilters && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                !
              </span>
            )}
          </Button>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {onExport && (
            <Button
              variant="outline"
              onClick={onExport}
              className="border-gray-200 dark:border-gray-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          )}
          {onImport && (
            <Button
              variant="outline"
              onClick={onImport}
              className="border-gray-200 dark:border-gray-700"
            >
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>
          )}
          <Button onClick={onNewOpportunity} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Oportunidad
          </Button>
        </div>
      </div>

      {/* Filtros expandibles */}
      {showFilters && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pipeline */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Pipeline
              </label>
              <Select
                value={filters.pipelineId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    pipelineId: value === 'all' ? undefined : value,
                    stageId: undefined,
                  })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Todos los pipelines" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  <SelectItem value="all">Todos los pipelines</SelectItem>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Etapa */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Etapa
              </label>
              <Select
                value={filters.stageId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, stageId: value === 'all' ? undefined : value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Todas las etapas" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  <SelectItem value="all">Todas las etapas</SelectItem>
                  {filteredStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estado */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Estado
              </label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    status: value === 'all' ? undefined : (value as OpportunityFilters['status']),
                  })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="open">Abierta</SelectItem>
                  <SelectItem value="won">Ganada</SelectItem>
                  <SelectItem value="lost">Perdida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cliente */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Cliente
              </label>
              <Select
                value={filters.customerId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, customerId: value === 'all' ? undefined : value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 max-h-60">
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha desde */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Fecha cierre desde
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                      !filters.dateFrom && 'text-gray-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateFrom
                      ? format(new Date(filters.dateFrom), 'dd/MM/yyyy', { locale: es })
                      : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800">
                  <Calendar
                    mode="single"
                    selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                    onSelect={(date) =>
                      onFiltersChange({
                        ...filters,
                        dateFrom: date ? format(date, 'yyyy-MM-dd') : undefined,
                      })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Fecha hasta */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Fecha cierre hasta
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                      !filters.dateTo && 'text-gray-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateTo
                      ? format(new Date(filters.dateTo), 'dd/MM/yyyy', { locale: es })
                      : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800">
                  <Calendar
                    mode="single"
                    selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                    onSelect={(date) =>
                      onFiltersChange({
                        ...filters,
                        dateTo: date ? format(date, 'yyyy-MM-dd') : undefined,
                      })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Botón limpiar */}
          {hasActiveFilters && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                onClick={handleClearFilters}
                className="text-gray-600 dark:text-gray-400"
              >
                <X className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
