'use client';

import type { EmploymentCompensation } from '@/lib/services/employmentCompensationService';
import { formatCurrency, formatDate } from '@/utils/Utils';
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
  MoreHorizontal,
  Edit,
  Trash2,
  Calendar,
  CalendarX,
  Users,
} from 'lucide-react';

interface AssignmentsTableProps {
  assignments: EmploymentCompensation[];
  onEdit: (assignment: EmploymentCompensation) => void;
  onDelete: (assignment: EmploymentCompensation) => void;
  onEndAssignment: (assignment: EmploymentCompensation) => void;
  isLoading?: boolean;
}

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  approved: 'Aprobado',
  ended: 'Finalizado',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  ended: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

export function AssignmentsTable({
  assignments,
  onEdit,
  onDelete,
  onEndAssignment,
  isLoading,
}: AssignmentsTableProps) {
  const isActive = (assignment: EmploymentCompensation) => {
    const today = new Date().toISOString().split('T')[0];
    return (
      assignment.effective_from <= today &&
      (!assignment.effective_to || assignment.effective_to >= today) &&
      assignment.status !== 'ended'
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No hay asignaciones
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Asigna paquetes de compensación a empleados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Paquete</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Salario</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Vigencia</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((assignment) => (
            <TableRow
              key={assignment.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {assignment.employee_name}
                  </div>
                  {assignment.employee_code && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {assignment.employee_code}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium text-gray-900 dark:text-white">
                  {assignment.package_name}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-gray-900 dark:text-white">
                  {assignment.salary_override
                    ? formatCurrency(assignment.salary_override, assignment.currency_code || 'COP')
                    : assignment.package_base_salary
                    ? formatCurrency(assignment.package_base_salary, assignment.currency_code || 'COP')
                    : '-'}
                </div>
                {assignment.salary_override && assignment.package_base_salary && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Override (base: {formatCurrency(assignment.package_base_salary, assignment.currency_code || 'COP')})
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatDate(assignment.effective_from)}
                    {' - '}
                    {assignment.effective_to ? formatDate(assignment.effective_to) : 'Indefinido'}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={statusColors[assignment.status || 'active']}>
                  {isActive(assignment) && assignment.status !== 'ended' ? (
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Vigente
                    </span>
                  ) : (
                    statusLabels[assignment.status || 'active']
                  )}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800">
                    <DropdownMenuItem onClick={() => onEdit(assignment)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    {isActive(assignment) && (
                      <DropdownMenuItem onClick={() => onEndAssignment(assignment)}>
                        <CalendarX className="mr-2 h-4 w-4" />
                        Finalizar vigencia
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(assignment)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
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
