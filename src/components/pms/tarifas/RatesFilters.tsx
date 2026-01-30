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
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

interface SpaceType {
  id: string;
  name: string;
}

interface RatesFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  spaceTypeFilter: string;
  onSpaceTypeChange: (value: string) => void;
  planFilter: string;
  onPlanChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  spaceTypes: SpaceType[];
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

const PLANS = [
  { value: 'all', label: 'Todos los planes' },
  { value: 'solo_alojamiento', label: 'Solo Alojamiento' },
  { value: 'con_desayuno', label: 'Con Desayuno' },
  { value: 'media_pension', label: 'Media Pensión' },
  { value: 'pension_completa', label: 'Pensión Completa' },
  { value: 'todo_incluido', label: 'Todo Incluido' },
];

const STATUS = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'upcoming', label: 'Próximas' },
  { value: 'expired', label: 'Expiradas' },
];

export function RatesFilters({
  searchTerm,
  onSearchChange,
  spaceTypeFilter,
  onSpaceTypeChange,
  planFilter,
  onPlanChange,
  statusFilter,
  onStatusChange,
  spaceTypes,
  onClearFilters,
  hasActiveFilters,
}: RatesFiltersProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por tipo de espacio..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filtro por tipo de espacio */}
        <Select value={spaceTypeFilter} onValueChange={onSpaceTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de espacio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {spaceTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro por plan */}
        <Select value={planFilter} onValueChange={onPlanChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            {PLANS.map((plan) => (
              <SelectItem key={plan.value} value={plan.value}>
                {plan.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro por estado */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Limpiar filtros */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
