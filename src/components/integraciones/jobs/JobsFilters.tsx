'use client';

import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface JobsFiltersProps {
  connections: IntegrationConnection[];
  jobTypes: string[];
  resourceTypes: string[];
  filters: {
    connectionId: string;
    status: string;
    jobType: string;
    resourceType: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'queued', label: 'En cola' },
  { value: 'running', label: 'Ejecutando' },
  { value: 'success', label: 'Exitoso' },
  { value: 'failed', label: 'Fallido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const JOB_TYPE_LABELS: Record<string, string> = {
  pull: 'Pull (Obtener)',
  push: 'Push (Enviar)',
  full_sync: 'Sync Completo',
  incremental: 'Incremental',
  reconcile: 'Reconciliación',
  webhook_replay: 'Replay Webhook',
};

export function JobsFilters({
  connections,
  jobTypes,
  resourceTypes,
  filters,
  onFilterChange,
  onClearFilters,
}: JobsFiltersProps) {
  const hasActiveFilters =
    filters.connectionId !== 'all' ||
    filters.status !== 'all' ||
    filters.jobType !== 'all' ||
    filters.resourceType !== 'all';

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

        {/* Tipo de Job */}
        <Select
          value={filters.jobType}
          onValueChange={(value) => onFilterChange('jobType', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Tipo de Job" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {jobTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {JOB_TYPE_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tipo de Recurso */}
        <Select
          value={filters.resourceType}
          onValueChange={(value) => onFilterChange('resourceType', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Tipo de Recurso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los recursos</SelectItem>
            {resourceTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          {filters.jobType !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Tipo: {JOB_TYPE_LABELS[filters.jobType] || filters.jobType}
            </Badge>
          )}
          {filters.resourceType !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Recurso: {filters.resourceType}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default JobsFilters;
