'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { SpaceFilters, ParkingZone } from './types';

interface EspaciosFiltersProps {
  filters: SpaceFilters;
  zones: ParkingZone[];
  onFiltersChange: (filters: SpaceFilters) => void;
  onClear: () => void;
}

const spaceTypes = [
  { value: '__all__', label: 'Todos los tipos' },
  { value: 'car', label: 'Automóvil' },
  { value: 'motorcycle', label: 'Motocicleta' },
  { value: 'truck', label: 'Camión' },
  { value: 'bicycle', label: 'Bicicleta' },
];

const spaceStates = [
  { value: '__all__', label: 'Todos los estados' },
  { value: 'free', label: 'Libre' },
  { value: 'occupied', label: 'Ocupado' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'disabled', label: 'Deshabilitado' },
];

export function EspaciosFilters({
  filters,
  zones,
  onFiltersChange,
  onClear,
}: EspaciosFiltersProps) {
  const hasFilters =
    filters.search || filters.zone_id || filters.type || filters.state;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por etiqueta..."
              value={filters.search}
              onChange={(e) =>
                onFiltersChange({ ...filters, search: e.target.value })
              }
              className="pl-10"
            />
          </div>
        </div>

        <Select
          value={filters.zone_id || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, zone_id: value === '__all__' ? '' : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las zonas</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.type || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, type: value === '__all__' ? '' : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {spaceTypes.map((type) => (
              <SelectItem key={type.value || '__all__'} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.state || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, state: value === '__all__' ? '' : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {spaceStates.map((state) => (
              <SelectItem key={state.value || '__all__'} value={state.value}>
                {state.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
