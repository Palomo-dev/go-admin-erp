'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Filter } from 'lucide-react';
import { SearchInput } from '@/components/kit/SearchInput';

export interface JobPositionFilters {
  search: string;
  isActive: boolean | 'all';
  departmentId: string;
  level: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface JobPositionFiltersProps {
  filters: JobPositionFilters;
  onFiltersChange: (filters: JobPositionFilters) => void;
  departments: DepartmentOption[];
  levels: string[];
}

export function JobPositionFiltersComponent({
  filters,
  onFiltersChange,
  departments,
  levels,
}: JobPositionFiltersProps) {
  // El debounce (300 ms, el de siempre) lo pone `SearchInput`.
  const handleSearchChange = (texto: string) => {
    if (texto !== filters.search) onFiltersChange({ ...filters, search: texto });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      search: '',
      isActive: 'all',
      departmentId: '',
      level: '',
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.isActive !== 'all' ||
    filters.departmentId ||
    filters.level;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros</span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="ml-auto text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Búsqueda */}
        <SearchInput
          value={filters.search}
          onChange={handleSearchChange}
          debounceMs={300}
          placeholder="Buscar por nombre o código..."
        />

        {/* Departamento */}
        <Select
          value={filters.departmentId || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, departmentId: value === 'all' ? '' : value })
          }
        >
          <SelectTrigger className="bg-white dark:bg-gray-900">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los departamentos</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Nivel */}
        <Select
          value={filters.level || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, level: value === 'all' ? '' : value })
          }
        >
          <SelectTrigger className="bg-white dark:bg-gray-900">
            <SelectValue placeholder="Nivel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            {levels.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Estado */}
        <Select
          value={filters.isActive === 'all' ? 'all' : filters.isActive ? 'active' : 'inactive'}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              isActive: value === 'all' ? 'all' : value === 'active',
            })
          }
        >
          <SelectTrigger className="bg-white dark:bg-gray-900">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default JobPositionFiltersComponent;
