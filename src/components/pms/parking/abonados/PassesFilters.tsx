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
import { Search, Filter, Clock } from 'lucide-react';

export interface PassFiltersState {
  search: string;
  status: string;
  expiringDays: string;
}

interface PassesFiltersProps {
  filters: PassFiltersState;
  onFiltersChange: (filters: PassFiltersState) => void;
}

export function PassesFilters({ filters, onFiltersChange }: PassesFiltersProps) {
  const handleChange = (key: keyof PassFiltersState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por cliente, placa o plan..."
          value={filters.search}
          onChange={(e) => handleChange('search', e.target.value)}
          className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(v) => handleChange('status', v)}
      >
        <SelectTrigger className="w-full sm:w-40 dark:bg-gray-800 dark:border-gray-700">
          <Filter className="h-4 w-4 mr-2 text-gray-400" />
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Activo</SelectItem>
          <SelectItem value="expired">Vencido</SelectItem>
          <SelectItem value="suspended">Suspendido</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.expiringDays}
        onValueChange={(v) => handleChange('expiringDays', v)}
      >
        <SelectTrigger className="w-full sm:w-48 dark:bg-gray-800 dark:border-gray-700">
          <Clock className="h-4 w-4 mr-2 text-gray-400" />
          <SelectValue placeholder="Vencimiento" />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">Sin filtro</SelectItem>
          <SelectItem value="7">Vence en 7 días</SelectItem>
          <SelectItem value="15">Vence en 15 días</SelectItem>
          <SelectItem value="30">Vence en 30 días</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default PassesFilters;
