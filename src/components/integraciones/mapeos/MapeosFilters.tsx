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

interface MapeosFiltersProps {
  connections: IntegrationConnection[];
  externalTypes: string[];
  internalTables: string[];
  filters: {
    connectionId: string;
    externalType: string;
    internalTable: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

export function MapeosFilters({
  connections,
  externalTypes,
  internalTables,
  filters,
  onFilterChange,
  onClearFilters,
}: MapeosFiltersProps) {
  const hasActiveFilters =
    filters.connectionId !== 'all' ||
    filters.externalType !== 'all' ||
    filters.internalTable !== 'all';

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

        {/* Tipo Externo */}
        <Select
          value={filters.externalType}
          onValueChange={(value) => onFilterChange('externalType', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Tipo Externo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos externos</SelectItem>
            {externalTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tabla Interna */}
        <Select
          value={filters.internalTable}
          onValueChange={(value) => onFilterChange('internalTable', value)}
        >
          <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Tabla Interna" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tablas internas</SelectItem>
            {internalTables.map((table) => (
              <SelectItem key={table} value={table}>
                {table}
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
          {filters.externalType !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Tipo externo: {filters.externalType}
            </Badge>
          )}
          {filters.internalTable !== 'all' && (
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Tabla interna: {filters.internalTable}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default MapeosFilters;
