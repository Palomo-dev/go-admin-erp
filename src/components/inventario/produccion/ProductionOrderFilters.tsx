'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';

interface ProductionOrderFiltersProps {
  busqueda: string;
  onBusquedaChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export function ProductionOrderFilters({
  busqueda,
  onBusquedaChange,
  statusFilter,
  onStatusFilterChange,
}: ProductionOrderFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por producto o receta..."
          value={busqueda}
          onChange={(e) => onBusquedaChange(e.target.value)}
          className="pl-10 dark:bg-gray-900 dark:border-gray-600"
        />
      </div>
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-full md:w-48 dark:bg-gray-900 dark:border-gray-600">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="draft">Borrador</SelectItem>
          <SelectItem value="confirmed">Confirmada</SelectItem>
          <SelectItem value="in_progress">En proceso</SelectItem>
          <SelectItem value="completed">Completada</SelectItem>
          <SelectItem value="cancelled">Cancelada</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
