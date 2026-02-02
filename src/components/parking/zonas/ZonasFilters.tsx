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
import { ZoneFilters } from './types';

interface ZonasFiltersProps {
  filters: ZoneFilters;
  onFiltersChange: (filters: ZoneFilters) => void;
  onClear: () => void;
}

const activeOptions = [
  { value: '__all__', label: 'Todas' },
  { value: 'true', label: 'Activas' },
  { value: 'false', label: 'Inactivas' },
];

const coveredOptions = [
  { value: '__all__', label: 'Todas' },
  { value: 'true', label: 'Cubiertas' },
  { value: 'false', label: 'Descubiertas' },
];

const vipOptions = [
  { value: '__all__', label: 'Todas' },
  { value: 'true', label: 'VIP' },
  { value: 'false', label: 'Normal' },
];

export function ZonasFilters({
  filters,
  onFiltersChange,
  onClear,
}: ZonasFiltersProps) {
  const hasFilters =
    filters.search || filters.is_active || filters.is_covered || filters.is_vip;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre..."
              value={filters.search}
              onChange={(e) =>
                onFiltersChange({ ...filters, search: e.target.value })
              }
              className="pl-10"
            />
          </div>
        </div>

        <Select
          value={filters.is_active || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, is_active: value === '__all__' ? '' : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {activeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.is_covered || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, is_covered: value === '__all__' ? '' : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Cobertura" />
          </SelectTrigger>
          <SelectContent>
            {coveredOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.is_vip || '__all__'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, is_vip: value === '__all__' ? '' : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {vipOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
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
