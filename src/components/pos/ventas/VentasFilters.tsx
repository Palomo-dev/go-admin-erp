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
    (filters.source_type && filters.source_type !== 'all') ||
    filters.date_from ||
    filters.date_to;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Búsqueda */}
        <form onSubmit={handleSearchSubmit} className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="ID, cliente, notas..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>
        </form>

        {/* Origen */}
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Origen</label>
          <Select
            value={filters.source_type || 'all'}
            onValueChange={(value) => onFiltersChange({ ...filters, source_type: value as SalesFilter['source_type'] })}
          >
            <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Origen" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-700">Todos</SelectItem>
              <SelectItem value="pos" className="dark:text-white dark:hover:bg-gray-700">POS</SelectItem>
              <SelectItem value="web" className="dark:text-white dark:hover:bg-gray-700">Página Web</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Estado */}
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Estado</label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) => onFiltersChange({ ...filters, status: value as SalesFilter['status'] })}
          >
            <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-700">Todos los estados</SelectItem>
              <SelectItem value="pending" className="dark:text-white dark:hover:bg-gray-700">Pendiente</SelectItem>
              <SelectItem value="completed" className="dark:text-white dark:hover:bg-gray-700">Completada</SelectItem>
              <SelectItem value="cancelled" className="dark:text-white dark:hover:bg-gray-700">Anulada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Estado de pago */}
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Estado de pago</label>
          <Select
            value={filters.payment_status || 'all'}
            onValueChange={(value) => onFiltersChange({ ...filters, payment_status: value as SalesFilter['payment_status'] })}
          >
            <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-white">
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

        {/* Desde */}
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
          <Input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => onFiltersChange({ ...filters, date_from: e.target.value })}
            className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:[color-scheme:dark]"
          />
        </div>

        {/* Hasta */}
        <div>
          <label className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
          <Input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => onFiltersChange({ ...filters, date_to: e.target.value })}
            className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:[color-scheme:dark]"
          />
        </div>

        {/* Limpiar filtros */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setLocalSearch('');
                onClearFilters();
              }}
              className="text-gray-500 dark:text-gray-400 w-full"
            >
              <X className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
