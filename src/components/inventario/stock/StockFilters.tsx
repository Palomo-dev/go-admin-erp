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
import { Search, X, Filter } from 'lucide-react';

interface StockFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  branchId: string;
  onBranchChange: (value: string) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  stockFilter: string;
  onStockFilterChange: (value: string) => void;
  branches: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function StockFilters({
  searchTerm,
  onSearchChange,
  branchId,
  onBranchChange,
  categoryId,
  onCategoryChange,
  stockFilter,
  onStockFilterChange,
  branches,
  categories,
  onClearFilters,
  hasActiveFilters
}: StockFiltersProps) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Filter className="h-4 w-4" />
        Filtros
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Búsqueda */}
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, SKU o código..."
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

        {/* Categoría */}
        <Select value={categoryId} onValueChange={onCategoryChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id.toString()}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro de Stock */}
        <Select value={stockFilter} onValueChange={onStockFilterChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Estado de stock" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="available">Con disponibilidad</SelectItem>
            <SelectItem value="low">Bajo mínimo</SelectItem>
            <SelectItem value="out">Sin stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}

export default StockFilters;
