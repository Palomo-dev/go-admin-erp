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
import { RateFilters } from './types';

interface TarifasFiltersProps {
  filters: RateFilters;
  onFiltersChange: (filters: RateFilters) => void;
  onClear: () => void;
}

const vehicleTypes = [
  { value: 'car', label: 'Automóvil' },
  { value: 'motorcycle', label: 'Motocicleta' },
  { value: 'truck', label: 'Camión' },
  { value: 'bicycle', label: 'Bicicleta' },
];

const unitTypes = [
  { value: 'minute', label: 'Por Minuto' },
  { value: 'hour', label: 'Por Hora' },
  { value: 'day', label: 'Por Día' },
];

export function TarifasFilters({
  filters,
  onFiltersChange,
  onClear,
}: TarifasFiltersProps) {
  const hasFilters =
    filters.search || filters.vehicle_type || filters.unit || filters.is_active;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre..."
            value={filters.search}
            onChange={(e) =>
              onFiltersChange({ ...filters, search: e.target.value })
            }
            className="pl-10"
          />
        </div>

        <Select
          value={filters.vehicle_type || '__all__'}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, vehicle_type: v === '__all__' ? '' : v })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo de vehículo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los tipos</SelectItem>
            {vehicleTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.unit || '__all__'}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, unit: v === '__all__' ? '' : v })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Unidad de tiempo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las unidades</SelectItem>
            {unitTypes.map((unit) => (
              <SelectItem key={unit.value} value={unit.value}>
                {unit.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.is_active || '__all__'}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, is_active: v === '__all__' ? '' : v })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="inactive">Inactivas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4 mr-2" />
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
