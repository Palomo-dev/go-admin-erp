'use client';

import React from 'react';
import { Filter, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface EventsFiltersProps {
  connections: IntegrationConnection[];
  eventTypes: string[];
  filters: {
    connectionId: string;
    status: string;
    source: string;
    direction: string;
    eventType: string;
    dateFrom: string;
    dateTo: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'received', label: 'Recibido' },
  { value: 'processed', label: 'Procesado' },
  { value: 'error', label: 'Error' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Todas las fuentes' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'sync', label: 'Sincronización' },
  { value: 'manual', label: 'Manual' },
  { value: 'system', label: 'Sistema' },
];

const DIRECTION_OPTIONS = [
  { value: 'all', label: 'Todas las direcciones' },
  { value: 'inbound', label: 'Entrante' },
  { value: 'outbound', label: 'Saliente' },
];

export function EventsFilters({
  connections,
  eventTypes,
  filters,
  onFilterChange,
  onClearFilters,
}: EventsFiltersProps) {
  const hasActiveFilters =
    filters.connectionId !== 'all' ||
    filters.status !== 'all' ||
    filters.source !== 'all' ||
    filters.direction !== 'all' ||
    filters.eventType !== 'all' ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-4">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros</span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="ml-auto text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {/* Conexión */}
        <Select
          value={filters.connectionId}
          onValueChange={(value) => onFilterChange('connectionId', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Conexión" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las conexiones</SelectItem>
            {connections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id}>
                {conn.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Estado */}
        <Select
          value={filters.status}
          onValueChange={(value) => onFilterChange('status', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Fuente */}
        <Select
          value={filters.source}
          onValueChange={(value) => onFilterChange('source', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Fuente" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dirección */}
        <Select
          value={filters.direction}
          onValueChange={(value) => onFilterChange('direction', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Dirección" />
          </SelectTrigger>
          <SelectContent>
            {DIRECTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tipo de evento */}
        <Select
          value={filters.eventType}
          onValueChange={(value) => onFilterChange('eventType', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {eventTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Fecha desde */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFilterChange('dateFrom', e.target.value)}
            className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            placeholder="Desde"
          />
        </div>

        {/* Fecha hasta */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFilterChange('dateTo', e.target.value)}
            className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            placeholder="Hasta"
          />
        </div>
      </div>

      {/* Filtros activos como badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-3">
          {filters.connectionId !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Conexión: {connections.find(c => c.id === filters.connectionId)?.name}
            </Badge>
          )}
          {filters.status !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Estado: {STATUS_OPTIONS.find(s => s.value === filters.status)?.label}
            </Badge>
          )}
          {filters.source !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Fuente: {SOURCE_OPTIONS.find(s => s.value === filters.source)?.label}
            </Badge>
          )}
          {filters.direction !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Dirección: {DIRECTION_OPTIONS.find(d => d.value === filters.direction)?.label}
            </Badge>
          )}
          {filters.eventType !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Tipo: {filters.eventType}
            </Badge>
          )}
          {filters.dateFrom && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Desde: {filters.dateFrom}
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Hasta: {filters.dateTo}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default EventsFilters;
