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
import { Search, X, Filter, Calendar } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface MovimientosFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  branchId: string;
  onBranchChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  direction: string;
  onDirectionChange: (value: string) => void;
  dateFrom: Date | undefined;
  onDateFromChange: (date: Date | undefined) => void;
  dateTo: Date | undefined;
  onDateToChange: (date: Date | undefined) => void;
  branches: { id: number; name: string }[];
  sourceTypes: { value: string; label: string }[];
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function MovimientosFilters({
  searchTerm,
  onSearchChange,
  branchId,
  onBranchChange,
  source,
  onSourceChange,
  direction,
  onDirectionChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  branches,
  sourceTypes,
  onClearFilters,
  hasActiveFilters
}: MovimientosFiltersProps) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Filter className="h-4 w-4" />
        Filtros
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nota o documento..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
          />
        </div>

        {/* Sucursal */}
        <Select value={branchId} onValueChange={onBranchChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Todas las sucursales" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Todas las sucursales</SelectItem>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id.toString()}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Origen */}
        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Todos los orígenes" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Todos los orígenes</SelectItem>
            {sourceTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dirección */}
        <Select value={direction} onValueChange={onDirectionChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Todas las direcciones" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Entradas y Salidas</SelectItem>
            <SelectItem value="in">Solo Entradas</SelectItem>
            <SelectItem value="out">Solo Salidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="justify-start text-left font-normal dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            >
              <Calendar className="mr-2 h-4 w-4" />
              {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: es }) : 'Desde'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 dark:bg-gray-900 dark:border-gray-700" align="start">
            <CalendarComponent
              mode="single"
              selected={dateFrom}
              onSelect={onDateFromChange}
              initialFocus
              locale={es}
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="justify-start text-left font-normal dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            >
              <Calendar className="mr-2 h-4 w-4" />
              {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: es }) : 'Hasta'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 dark:bg-gray-900 dark:border-gray-700" align="start">
            <CalendarComponent
              mode="single"
              selected={dateTo}
              onSelect={onDateToChange}
              initialFocus
              locale={es}
            />
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

export default MovimientosFilters;
