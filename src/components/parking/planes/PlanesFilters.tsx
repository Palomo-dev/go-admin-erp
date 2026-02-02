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

export interface PlanFiltersState {
  search: string;
  status: 'all' | 'active' | 'inactive';
  vehicleType: 'all' | 'car' | 'motorcycle' | 'truck';
}

interface PlanesFiltersProps {
  filters: PlanFiltersState;
  onFiltersChange: (filters: PlanFiltersState) => void;
}

export function PlanesFilters({ filters, onFiltersChange }: PlanesFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Búsqueda */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por nombre o descripción..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-10 dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      {/* Estado */}
      <Select
        value={filters.status}
        onValueChange={(value: 'all' | 'active' | 'inactive') =>
          onFiltersChange({ ...filters, status: value })
        }
      >
        <SelectTrigger className="w-40 dark:bg-gray-800 dark:border-gray-700">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Activos</SelectItem>
          <SelectItem value="inactive">Inactivos</SelectItem>
        </SelectContent>
      </Select>

      {/* Tipo de vehículo */}
      <Select
        value={filters.vehicleType}
        onValueChange={(value: 'all' | 'car' | 'motorcycle' | 'truck') =>
          onFiltersChange({ ...filters, vehicleType: value })
        }
      >
        <SelectTrigger className="w-44 dark:bg-gray-800 dark:border-gray-700">
          <SelectValue placeholder="Tipo vehículo" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Todos los tipos</SelectItem>
          <SelectItem value="car">Carros</SelectItem>
          <SelectItem value="motorcycle">Motos</SelectItem>
          <SelectItem value="truck">Camiones</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default PlanesFilters;
