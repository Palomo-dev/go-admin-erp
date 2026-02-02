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
      <CardContent className="pt-4 space-y-4">
        {/* Fila principal de filtros */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Buscar por nombre, código o email..."
              className="pl-10 bg-white dark:bg-gray-900"
            />
          </div>

          {/* Estado */}
          <Select
            value={filters.status}
            onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
          >
            <SelectTrigger className="w-[160px] bg-white dark:bg-gray-900">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
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
              <SelectTrigger className="w-[160px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Sede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sedes</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
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
          >
            <Filter className="h-4 w-4 mr-2" />
            Más filtros
          </Button>

          {/* Limpiar */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              <X className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>

        {/* Filtros avanzados */}
        {showAdvanced && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
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
                <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los deptos.</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
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
                <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los cargos</SelectItem>
                  {positions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>
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
              <SelectTrigger className="w-[170px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Tipo contrato" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
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
                    'w-[150px] justify-start text-left font-normal bg-white dark:bg-gray-900',
                    !filters.hireDateFrom && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.hireDateFrom
                    ? format(new Date(filters.hireDateFrom), 'dd/MM/yyyy')
                    : 'Desde'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
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
                    'w-[150px] justify-start text-left font-normal bg-white dark:bg-gray-900',
                    !filters.hireDateTo && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.hireDateTo
                    ? format(new Date(filters.hireDateTo), 'dd/MM/yyyy')
                    : 'Hasta'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
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
