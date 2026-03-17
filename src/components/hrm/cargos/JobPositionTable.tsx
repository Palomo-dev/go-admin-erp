'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Eye,
  Edit,
  Copy,
  ToggleLeft,
  Trash2,
  Users,
  DollarSign,
  Briefcase,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

export interface JobPositionRow {
  id: string;
  code: string | null;
  name: string;
  level: string | null;
  min_salary: number | null;
  max_salary: number | null;
  is_active: boolean;
  department_name?: string;
  employees_count?: number;
}

interface JobPositionTableProps {
  positions: JobPositionRow[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
}

export function JobPositionTable({
  positions,
  onView,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
}: JobPositionTableProps) {
  const formatSalaryRange = (min: number | null, max: number | null) => {
    if (min === null && max === null) return '-';
    if (min !== null && max !== null) {
      return `${formatCurrency(min)} - ${formatCurrency(max)}`;
    }
    if (min !== null) return `Desde ${formatCurrency(min)}`;
    return `Hasta ${formatCurrency(max!)}`;
  };

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
        <Briefcase className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mb-3 sm:mb-4" />
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-1">
          No hay cargos
        </h3>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          No se encontraron cargos con los filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300">Cargo</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Departamento</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Nivel</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">Rango Salarial</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center hidden md:table-cell">Empleados</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center">Estado</TableHead>
            <TableHead className="w-10 sm:w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow
              key={position.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50"
              onClick={() => onView(position.id)}
            >
              <TableCell className="py-2 sm:py-3">
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                    {position.name}
                  </span>
                  {position.code && (
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {position.code}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  {position.department_name || '-'}
                </span>
              </TableCell>
              <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                {position.level ? (
                  <Badge variant="outline" className="font-normal text-[10px] sm:text-xs border-gray-300 dark:border-gray-600">
                    {position.level}
                  </Badge>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">-</span>
                )}
              </TableCell>
              <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                <div className="flex items-center gap-1 text-xs sm:text-sm">
                  <DollarSign className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {formatSalaryRange(position.min_salary, position.max_salary)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2 sm:py-3 text-center hidden md:table-cell">
                <div className="flex items-center justify-center gap-1">
                  <Users className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                    {position.employees_count || 0}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2 sm:py-3 text-center">
                <Badge
                  variant={position.is_active ? 'default' : 'secondary'}
                  className={`text-[10px] sm:text-xs ${
                    position.is_active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {position.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell className="py-2 sm:py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <DropdownMenuItem onClick={() => onView(position.id)}>
                      <Eye className="h-4 w-4 mr-2" />
                      Ver detalles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(position.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(position.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onToggleActive(position.id)}>
                      <ToggleLeft className="h-4 w-4 mr-2" />
                      {position.is_active ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(position.id)}
                      className="text-red-600 dark:text-red-400"
                      disabled={(position.employees_count || 0) > 0}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

export default JobPositionTable;
