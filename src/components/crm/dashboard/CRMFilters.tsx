'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CalendarIcon,
  Filter,
  X,
  RefreshCw,
} from 'lucide-react';
import { CRMFilters, Channel, Pipeline, Agent, Branch } from './types';

interface CRMFiltersProps {
  filters: CRMFilters;
  onFiltersChange: (filters: CRMFilters) => void;
  channels: Channel[];
  pipelines: Pipeline[];
  agents: Agent[];
  branches: Branch[];
  onRefresh: () => void;
  isLoading: boolean;
}

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | '30days' | 'custom';

export function CRMFiltersComponent({
  filters,
  onFiltersChange,
  channels,
  pipelines,
  agents,
  branches,
  onRefresh,
  isLoading,
}: CRMFiltersProps) {
  const [datePreset, setDatePreset] = useState<DatePreset>('30days');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = new Date();
    let from: Date | null = null;
    let to: Date | null = today;

    switch (preset) {
      case 'today':
        from = today;
        break;
      case 'yesterday':
        from = subDays(today, 1);
        to = subDays(today, 1);
        break;
      case 'week':
        from = startOfWeek(today, { locale: es });
        to = endOfWeek(today, { locale: es });
        break;
      case 'month':
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case '30days':
        from = subDays(today, 30);
        break;
      case 'custom':
        setShowDatePicker(true);
        return;
    }

    onFiltersChange({
      ...filters,
      dateRange: { from, to },
    });
  };

  const handleChannelChange = (value: string) => {
    onFiltersChange({
      ...filters,
      channelId: value === 'all' ? null : value,
    });
  };

  const handlePipelineChange = (value: string) => {
    onFiltersChange({
      ...filters,
      pipelineId: value === 'all' ? null : value,
    });
  };

  const handleAgentChange = (value: string) => {
    onFiltersChange({
      ...filters,
      agentId: value === 'all' ? null : value,
    });
  };

  const clearFilters = () => {
    setDatePreset('30days');
    onFiltersChange({
      dateRange: { from: subDays(new Date(), 30), to: new Date() },
      channelId: null,
      pipelineId: null,
      agentId: null,
      branchId: null,
    });
  };

  const hasActiveFilters =
    filters.channelId ||
    filters.pipelineId ||
    filters.agentId ||
    datePreset !== '30days';

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Selector de fecha */}
      <div className="flex items-center gap-2">
        <Select value={datePreset} onValueChange={(v) => handleDatePreset(v as DatePreset)}>
          <SelectTrigger className="w-[140px] h-9 bg-white dark:bg-gray-900">
            <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="yesterday">Ayer</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="30days">Últimos 30 días</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {datePreset === 'custom' && (
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'justify-start text-left font-normal h-9',
                  !filters.dateRange.from && 'text-muted-foreground'
                )}
              >
                {filters.dateRange.from ? (
                  filters.dateRange.to ? (
                    <>
                      {format(filters.dateRange.from, 'dd/MM', { locale: es })} -{' '}
                      {format(filters.dateRange.to, 'dd/MM', { locale: es })}
                    </>
                  ) : (
                    format(filters.dateRange.from, 'dd/MM/yyyy', { locale: es })
                  )
                ) : (
                  'Seleccionar'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex gap-2 p-3">
                <div>
                  <p className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Desde</p>
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.from || undefined}
                    onSelect={(date) => {
                      onFiltersChange({
                        ...filters,
                        dateRange: {
                          from: date || null,
                          to: filters.dateRange.to,
                        },
                      });
                    }}
                    locale={es}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Hasta</p>
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.to || undefined}
                    onSelect={(date) => {
                      onFiltersChange({
                        ...filters,
                        dateRange: {
                          from: filters.dateRange.from,
                          to: date || null,
                        },
                      });
                    }}
                    locale={es}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Filtro de canal */}
      {channels.length > 0 && (
        <Select
          value={filters.channelId || 'all'}
          onValueChange={handleChannelChange}
        >
          <SelectTrigger className="w-[150px] h-9 bg-white dark:bg-gray-900">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los canales</SelectItem>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Filtro de pipeline */}
      {pipelines.length > 0 && (
        <Select
          value={filters.pipelineId || 'all'}
          onValueChange={handlePipelineChange}
        >
          <SelectTrigger className="w-[150px] h-9 bg-white dark:bg-gray-900">
            <SelectValue placeholder="Pipeline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pipelines</SelectItem>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name} {pipeline.isDefault && '(default)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Filtro de agente */}
      {agents.length > 0 && (
        <Select
          value={filters.agentId || 'all'}
          onValueChange={handleAgentChange}
        >
          <SelectTrigger className="w-[150px] h-9 bg-white dark:bg-gray-900">
            <SelectValue placeholder="Agente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los agentes</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={String(agent.id)}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex-1" />

      {/* Acciones */}
      <div className="flex items-center gap-2">
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-9"
        >
          <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>
    </div>
  );
}
