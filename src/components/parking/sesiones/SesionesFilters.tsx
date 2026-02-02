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
import { Search, X, Calendar, Filter } from 'lucide-react';

export interface SessionFilters {
  search: string;
  status: string;
  vehicleType: string;
  dateFrom: string;
  dateTo: string;
  isSubscriber: string;
}

interface SesionesFiltersProps {
  filters: SessionFilters;
  onFiltersChange: (filters: SessionFilters) => void;
  onClearFilters: () => void;
}

export function SesionesFilters({
  filters,
  onFiltersChange,
  onClearFilters,
}: SesionesFiltersProps) {
  const hasActiveFilters = 
    filters.search || 
    filters.status !== 'all' || 
    filters.vehicleType !== 'all' || 
    filters.dateFrom || 
    filters.dateTo ||
    filters.isSubscriber !== 'all';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <h3 className="font-medium text-gray-900 dark:text-white">Filtros</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Búsqueda por placa */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar placa..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Estado */}
        <Select
          value={filters.status}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="open">Activas</SelectItem>
            <SelectItem value="closed">Cerradas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>

        {/* Tipo de vehículo */}
        <Select
          value={filters.vehicleType}
          onValueChange={(value) => onFiltersChange({ ...filters, vehicleType: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo vehículo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="car">Carro</SelectItem>
            <SelectItem value="motorcycle">Moto</SelectItem>
            <SelectItem value="bicycle">Bicicleta</SelectItem>
            <SelectItem value="truck">Camión</SelectItem>
          </SelectContent>
        </Select>

        {/* Abonado/No abonado */}
        <Select
          value={filters.isSubscriber}
          onValueChange={(value) => onFiltersChange({ ...filters, isSubscriber: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="subscriber">Abonados</SelectItem>
            <SelectItem value="regular">No abonados</SelectItem>
          </SelectContent>
        </Select>

        {/* Fecha desde */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            className="pl-9"
            placeholder="Desde"
          />
        </div>

        {/* Fecha hasta */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
            className="pl-9"
            placeholder="Hasta"
          />
        </div>
      </div>
    </div>
  );
}
