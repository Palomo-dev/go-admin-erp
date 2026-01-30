'use client';

import { useState, useEffect } from 'react';
import { Calendar, Filter, X } from 'lucide-react';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ReportFilters } from './types';

interface ReportesFiltrosProps {
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  channels: { id: string; name: string; type: string }[];
  pipelines: { id: string; name: string }[];
  agents: { id: string; name: string }[];
}

export function ReportesFiltros({
  filters,
  onFiltersChange,
  channels,
  pipelines,
  agents
}: ReportesFiltrosProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    filters.dateFrom ? new Date(filters.dateFrom) : undefined
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(
    filters.dateTo ? new Date(filters.dateTo) : undefined
  );

  useEffect(() => {
    onFiltersChange({
      ...filters,
      dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : null,
      dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : null
    });
  }, [dateFrom, dateTo]);

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    onFiltersChange({
      dateFrom: null,
      dateTo: null,
      channelId: null,
      pipelineId: null,
      agentId: null
    });
  };

  const hasActiveFilters = dateFrom || dateTo || filters.channelId || filters.pipelineId || filters.agentId;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">Filtros</span>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Fecha desde */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Desde</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal bg-white dark:bg-gray-800"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Fecha hasta */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Hasta</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal bg-white dark:bg-gray-800"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Canal */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Canal</Label>
          <Select
            value={filters.channelId || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, channelId: v === 'all' ? null : v })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos los canales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              {channels.map(channel => (
                <SelectItem key={channel.id} value={channel.id}>
                  {channel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pipeline */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Pipeline</Label>
          <Select
            value={filters.pipelineId || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, pipelineId: v === 'all' ? null : v })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos los pipelines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pipelines</SelectItem>
              {pipelines.map(pipeline => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Agente */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Agente</Label>
          <Select
            value={filters.agentId || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, agentId: v === 'all' ? null : v })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos los agentes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los agentes</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
