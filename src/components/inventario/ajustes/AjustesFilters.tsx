'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Filter } from 'lucide-react';
import { ADJUSTMENT_TYPES } from '@/lib/services/adjustmentService';

interface AjustesFiltersProps {
  branchId: string;
  onBranchChange: (value: string) => void;
  type: string;
  onTypeChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  branches: { id: number; name: string }[];
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function AjustesFilters({
  branchId,
  onBranchChange,
  type,
  onTypeChange,
  status,
  onStatusChange,
  branches,
  onClearFilters,
  hasActiveFilters
}: AjustesFiltersProps) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Filter className="h-4 w-4" />
        Filtros
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        {/* Tipo */}
        <Select value={type} onValueChange={onTypeChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Todos los tipos</SelectItem>
            {ADJUSTMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Estado */}
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="applied">Aplicado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        {/* Limpiar filtros */}
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

export default AjustesFilters;
