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
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Briefcase className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          No hay cargos
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No se encontraron cargos con los filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead className="font-semibold">Cargo</TableHead>
            <TableHead className="font-semibold">Departamento</TableHead>
            <TableHead className="font-semibold">Nivel</TableHead>
            <TableHead className="font-semibold">Rango Salarial</TableHead>
            <TableHead className="font-semibold text-center">Empleados</TableHead>
            <TableHead className="font-semibold text-center">Estado</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow
              key={position.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
              onClick={() => onView(position.id)}
            >
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {position.name}
                  </span>
                  {position.code && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {position.code}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-gray-600 dark:text-gray-300">
                  {position.department_name || '-'}
                </span>
              </TableCell>
              <TableCell>
                {position.level ? (
                  <Badge variant="outline" className="font-normal">
                    {position.level}
                  </Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <DollarSign className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {formatSalaryRange(position.min_salary, position.max_salary)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {position.employees_count || 0}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={position.is_active ? 'default' : 'secondary'}
                  className={
                    position.is_active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }
                >
                  {position.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
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
  );
}

export default JobPositionTable;
