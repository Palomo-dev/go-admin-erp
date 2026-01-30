'use client';

import { useState } from 'react';
import { Search, Filter, Calendar, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SalesFilter } from './types';

interface VentasFiltersProps {
  filters: SalesFilter;
  onFiltersChange: (filters: SalesFilter) => void;
  onClearFilters: () => void;
}

export function VentasFilters({ filters, onFiltersChange, onClearFilters }: VentasFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search || '');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFiltersChange({ ...filters, search: localSearch });
  };

  const hasActiveFilters = 
    filters.search || 
    (filters.status && filters.status !== 'all') || 
    (filters.payment_status && filters.payment_status !== 'all') ||
    filters.date_from ||
    filters.date_to;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Búsqueda */}
        <form onSubmit={handleSearchSubmit} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por ID, cliente, notas..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>
        </form>

        {/* Estado */}
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value as SalesFilter['status'] })}
        >
          <SelectTrigger className="w-full md:w-[180px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-700">Todos los estados</SelectItem>
            <SelectItem value="pending" className="dark:text-white dark:hover:bg-gray-700">Pendiente</SelectItem>
            <SelectItem value="completed" className="dark:text-white dark:hover:bg-gray-700">Completada</SelectItem>
            <SelectItem value="cancelled" className="dark:text-white dark:hover:bg-gray-700">Anulada</SelectItem>
          </SelectContent>
        </Select>

        {/* Estado de pago */}
        <Select
          value={filters.payment_status || 'all'}
          onValueChange={(value) => onFiltersChange({ ...filters, payment_status: value as SalesFilter['payment_status'] })}
        >
          <SelectTrigger className="w-full md:w-[180px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Estado de pago" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-700">Todos</SelectItem>
            <SelectItem value="paid" className="dark:text-white dark:hover:bg-gray-700">Pagado</SelectItem>
            <SelectItem value="pending" className="dark:text-white dark:hover:bg-gray-700">Pendiente</SelectItem>
            <SelectItem value="partial" className="dark:text-white dark:hover:bg-gray-700">Parcial</SelectItem>
            <SelectItem value="refunded" className="dark:text-white dark:hover:bg-gray-700">Reembolsado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filtros de fecha */}
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 md:flex-none">
          <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
            Desde
          </label>
          <Input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => onFiltersChange({ ...filters, date_from: e.target.value })}
            className="w-full md:w-[180px] dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>
        <div className="flex-1 md:flex-none">
          <label className="text-sm text-gray-500 dark:text-gray-400 mb-1 block">
            Hasta
          </label>
          <Input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => onFiltersChange({ ...filters, date_to: e.target.value })}
            className="w-full md:w-[180px] dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>

        {/* Limpiar filtros */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setLocalSearch('');
              onClearFilters();
            }}
            className="text-gray-500 dark:text-gray-400"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
