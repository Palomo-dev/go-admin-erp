'use client';

import React from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { SERVICE_CATEGORIES } from '@/lib/services/spaceServicesService';
import { SearchInput } from '@/components/kit/SearchInput';

interface ServiciosFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  typeFilter: string;
  onTypeChange: (v: string) => void;
}

export function ServiciosFilters({
  search, onSearchChange, categoryFilter, onCategoryChange, typeFilter, onTypeChange,
}: ServiciosFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        onValueChange={onSearchChange}
        placeholder="Buscar servicio..."
        className="flex-1"
      />
      <Select value={categoryFilter} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las categorías</SelectItem>
          {SERVICE_CATEGORIES.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los tipos</SelectItem>
          <SelectItem value="standard">Estándar</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
