'use client';

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

export interface DepartmentFilters {
  search: string;
  isActive: 'all' | 'true' | 'false';
  managerId: string;
}

interface EmploymentOption {
  id: string;
  full_name: string;
}

interface DepartmentFiltersProps {
  filters: DepartmentFilters;
  onFiltersChange: (filters: DepartmentFilters) => void;
  managers: EmploymentOption[];
  isLoading?: boolean;
}

export function DepartmentFiltersComponent({
  filters,
  onFiltersChange,
  managers,
  isLoading,
}: DepartmentFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, isActive: value as 'all' | 'true' | 'false' });
  };

  const handleManagerChange = (value: string) => {
    onFiltersChange({ ...filters, managerId: value === 'all' ? '' : value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      isActive: 'all',
      managerId: '',
    });
  };

  const hasActiveFilters =
    filters.search || filters.isActive !== 'all' || filters.managerId;

  return (
    <div className="flex flex-col sm:flex-row gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por nombre o código..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
          disabled={isLoading}
        />
      </div>

      {/* Status Filter */}
      <Select
        value={filters.isActive}
        onValueChange={handleStatusChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full sm:w-[150px] bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Activos</SelectItem>
          <SelectItem value="false">Inactivos</SelectItem>
        </SelectContent>
      </Select>

      {/* Manager Filter */}
      <Select
        value={filters.managerId || 'all'}
        onValueChange={handleManagerChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full sm:w-[200px] bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <SelectValue placeholder="Filtrar por jefe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los jefes</SelectItem>
          {managers.map((manager) => (
            <SelectItem key={manager.id} value={manager.id}>
              {manager.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="icon"
          onClick={clearFilters}
          className="shrink-0"
          title="Limpiar filtros"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default DepartmentFiltersComponent;
