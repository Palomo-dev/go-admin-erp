'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Filter } from 'lucide-react';

interface BranchOption {
  id: number;
  name: string;
}

interface TemplateOption {
  id: string;
  name: string;
  color: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  code: string | null;
}

export interface ShiftFiltersState {
  branchId: number | null;
  templateId: string;
  employmentId: string;
  status: string;
}

interface ShiftFiltersProps {
  filters: ShiftFiltersState;
  onFiltersChange: (filters: ShiftFiltersState) => void;
  branches: BranchOption[];
  templates: TemplateOption[];
  employees: EmployeeOption[];
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'swap_pending', label: 'Swap pendiente' },
  { value: 'absent', label: 'Ausente' },
  { value: 'late', label: 'Tardanza' },
];

export function ShiftFilters({
  filters,
  onFiltersChange,
  branches,
  templates,
  employees,
}: ShiftFiltersProps) {
  const handleClear = () => {
    onFiltersChange({
      branchId: null,
      templateId: '',
      employmentId: '',
      status: 'all',
    });
  };

  const hasActiveFilters =
    filters.branchId ||
    filters.templateId ||
    filters.employmentId ||
    filters.status !== 'all';

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center gap-3">
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
              <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
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

          {/* Plantilla de turno */}
          {templates.length > 0 && (
            <Select
              value={filters.templateId || 'all'}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  templateId: value === 'all' ? '' : value,
                })
              }
            >
              <SelectTrigger className="w-[180px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Tipo de turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los turnos</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      {template.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: template.color }}
                        />
                      )}
                      {template.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Empleado */}
          {employees.length > 0 && (
            <Select
              value={filters.employmentId || 'all'}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  employmentId: value === 'all' ? '' : value,
                })
              }
            >
              <SelectTrigger className="w-[200px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Empleado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los empleados</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} {emp.code && `(${emp.code})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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

          {/* Limpiar */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ShiftFilters;
