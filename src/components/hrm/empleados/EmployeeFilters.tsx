'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { Search, X, CalendarIcon, Filter } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface EmployeeFilters {
  search: string;
  status: string;
  branchId: number | null;
  departmentId: string;
  positionId: string;
  contractType: string;
  hireDateFrom: string;
  hireDateTo: string;
}

interface BranchOption {
  id: number;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface PositionOption {
  id: string;
  name: string;
}

interface EmployeeFiltersProps {
  filters: EmployeeFilters;
  onFiltersChange: (filters: EmployeeFilters) => void;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: 'Activo' },
  { value: 'probation', label: 'En prueba' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'terminated', label: 'Terminado' },
];

const CONTRACT_OPTIONS = [
  { value: 'all', label: 'Todos los contratos' },
  { value: 'indefinite', label: 'Indefinido' },
  { value: 'fixed_term', label: 'Término fijo' },
  { value: 'temporary', label: 'Temporal' },
  { value: 'internship', label: 'Pasantía' },
  { value: 'freelance', label: 'Freelance' },
];

export function EmployeeFiltersComponent({
  filters,
  onFiltersChange,
  branches,
  departments,
  positions,
}: EmployeeFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFiltersChange({ ...filters, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onFiltersChange]);

  const handleClearFilters = () => {
    setLocalSearch('');
    onFiltersChange({
      search: '',
      status: 'all',
      branchId: null,
      departmentId: '',
      positionId: '',
      contractType: 'all',
      hireDateFrom: '',
      hireDateTo: '',
    });
    setShowAdvanced(false);
  };

  const hasActiveFilters =
    filters.search ||
    filters.status !== 'all' ||
    filters.branchId ||
    filters.departmentId ||
    filters.positionId ||
    filters.contractType !== 'all' ||
    filters.hireDateFrom ||
    filters.hireDateTo;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-3 sm:pt-4 sm:p-6 space-y-3 sm:space-y-4">
        {/* Fila principal de filtros */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1 min-w-[150px] sm:min-w-[200px]">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500" />
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 sm:pl-10 h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          {/* Estado */}
          <Select
            value={filters.status}
            onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
          >
            <SelectTrigger className="w-[120px] sm:w-[160px] h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sede */}
          {branches.length > 0 && (
            <Select
              value={filters.branchId?.toString() || 'all'}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  branchId: value === 'all' ? null : parseInt(value),
                })
              }
            >
              <SelectTrigger className="w-[120px] sm:w-[160px] h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hidden sm:flex">
                <SelectValue placeholder="Sede" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectItem value="all" className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">Todas las sedes</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()} className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Botón filtros avanzados */}
          <Button
            variant={showAdvanced ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-9 text-xs sm:text-sm border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Más filtros</span>
            <span className="xs:hidden">Filtros</span>
          </Button>

          {/* Limpiar */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
              <span className="hidden xs:inline">Limpiar</span>
            </Button>
          )}
        </div>

        {/* Filtros avanzados */}
        {showAdvanced && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            {/* Departamento */}
            {departments.length > 0 && (
              <Select
                value={filters.departmentId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    departmentId: value === 'all' ? '' : value,
                  })
                }
              >
                <SelectTrigger className="w-[140px] sm:w-[180px] h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="all" className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">Todos los deptos.</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id} className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Cargo */}
            {positions.length > 0 && (
              <Select
                value={filters.positionId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    positionId: value === 'all' ? '' : value,
                  })
                }
              >
                <SelectTrigger className="w-[140px] sm:w-[180px] h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Cargo" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="all" className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">Todos los cargos</SelectItem>
                  {positions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id} className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                      {pos.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Tipo contrato */}
            <Select
              value={filters.contractType}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, contractType: value })
              }
            >
              <SelectTrigger className="w-[130px] sm:w-[170px] h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                <SelectValue placeholder="Tipo contrato" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                {CONTRACT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Fecha desde */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[120px] sm:w-[150px] h-9 text-xs sm:text-sm justify-start text-left font-normal bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
                    !filters.hireDateFrom && 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  <CalendarIcon className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {filters.hireDateFrom
                    ? format(new Date(filters.hireDateFrom), 'dd/MM/yyyy')
                    : 'Desde'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <Calendar
                  mode="single"
                  selected={filters.hireDateFrom ? new Date(filters.hireDateFrom) : undefined}
                  onSelect={(date: Date | undefined) =>
                    onFiltersChange({
                      ...filters,
                      hireDateFrom: date ? format(date, 'yyyy-MM-dd') : '',
                    })
                  }
                  locale={es}
                />
              </PopoverContent>
            </Popover>

            {/* Fecha hasta */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[120px] sm:w-[150px] h-9 text-xs sm:text-sm justify-start text-left font-normal bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
                    !filters.hireDateTo && 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  <CalendarIcon className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {filters.hireDateTo
                    ? format(new Date(filters.hireDateTo), 'dd/MM/yyyy')
                    : 'Hasta'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <Calendar
                  mode="single"
                  selected={filters.hireDateTo ? new Date(filters.hireDateTo) : undefined}
                  onSelect={(date: Date | undefined) =>
                    onFiltersChange({
                      ...filters,
                      hireDateTo: date ? format(date, 'yyyy-MM-dd') : '',
                    })
                  }
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EmployeeFiltersComponent;
