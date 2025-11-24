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
import type { SpaceCategory } from '@/lib/services/spaceTypesService';

interface SpaceTypesFiltersProps {
  searchTerm: string;
  categoryFilter: string;
  statusFilter: 'all' | 'active' | 'inactive';
  categories: SpaceCategory[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: 'all' | 'active' | 'inactive') => void;
}

export function SpaceTypesFilters({
  searchTerm,
  categoryFilter,
  statusFilter,
  categories,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
}: SpaceTypesFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Buscar por nombre..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-64"
      />

      <Select value={categoryFilter} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las categorías</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.code} value={category.code}>
              {category.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={(v: any) => onStatusChange(v)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Activos</SelectItem>
          <SelectItem value="inactive">Inactivos</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
