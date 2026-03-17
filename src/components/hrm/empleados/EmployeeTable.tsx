'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Eye,
  Edit,
  Copy,
  UserCheck,
  UserX,
  Clock,
  XCircle,
  Users,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

export interface EmployeeRow {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  employment_type: string;
  contract_type: string | null;
  hire_date: string;
  position_name: string | null;
  department_name: string | null;
  branch_name: string | null;
  manager_name: string | null;
  base_salary: number | null;
  currency_code: string;
}

interface EmployeeTableProps {
  employees: EmployeeRow[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onChangeStatus: (id: string, status: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: string; className: string }> = {
  active: {
    label: 'Activo',
    variant: 'default',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  probation: {
    label: 'En prueba',
    variant: 'secondary',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  suspended: {
    label: 'Suspendido',
    variant: 'secondary',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  terminated: {
    label: 'Terminado',
    variant: 'destructive',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

const CONTRACT_LABELS: Record<string, string> = {
  indefinite: 'Indefinido',
  fixed_term: 'Término fijo',
  temporary: 'Temporal',
  internship: 'Pasantía',
  freelance: 'Freelance',
};

export function EmployeeTable({
  employees,
  onView,
  onEdit,
  onDuplicate,
  onChangeStatus,
}: EmployeeTableProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (employees.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12">
        <Users className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3 sm:mb-4" />
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay empleados
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No se encontraron empleados con los filtros aplicados
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
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300">Empleado</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Código</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Cargo / Depto.</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">Sede</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">Contrato</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center">Estado</TableHead>
            <TableHead className="font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right hidden md:table-cell">Salario</TableHead>
            <TableHead className="w-10 sm:w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => {
            const statusConfig = STATUS_CONFIG[employee.status] || STATUS_CONFIG.active;
            const contractLabel = employee.contract_type
              ? CONTRACT_LABELS[employee.contract_type] || employee.contract_type
              : '-';

            return (
              <TableRow
                key={employee.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50"
                onClick={() => onView(employee.id)}
              >
                <TableCell className="py-2 sm:py-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                      <AvatarImage src={employee.avatar_url || undefined} alt={employee.full_name} />
                      <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs sm:text-sm">
                        {getInitials(employee.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                        {employee.full_name}
                      </span>
                      {employee.email && (
                        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                          {employee.email}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                  <span className="font-mono text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                    {employee.employee_code || '-'}
                  </span>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                  <div className="flex flex-col">
                    <span className="text-xs sm:text-sm text-gray-900 dark:text-white truncate max-w-[120px]">
                      {employee.position_name || '-'}
                    </span>
                    {employee.department_name && (
                      <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                        {employee.department_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                    {employee.branch_name || '-'}
                  </span>
                </TableCell>
                <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                  <div className="flex flex-col">
                    <span className="text-xs sm:text-sm text-gray-900 dark:text-white">{contractLabel}</span>
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                      Desde {formatDate(employee.hire_date)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2 sm:py-3 text-center">
                  <Badge variant="secondary" className={`${statusConfig.className} text-[10px] sm:text-xs`}>
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 sm:py-3 text-right hidden md:table-cell">
                  <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-white">
                    {employee.base_salary
                      ? formatCurrency(employee.base_salary, employee.currency_code)
                      : '-'}
                  </span>
                </TableCell>
                <TableCell className="py-2 sm:py-3" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onView(employee.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver ficha completa
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(employee.id)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar empleo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(employee.id)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar configuración
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Cambiar estado</DropdownMenuLabel>
                      {employee.status !== 'active' && (
                        <DropdownMenuItem
                          onClick={() => onChangeStatus(employee.id, 'active')}
                          className="text-green-600 dark:text-green-400"
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Activar
                        </DropdownMenuItem>
                      )}
                      {employee.status !== 'probation' && employee.status !== 'terminated' && (
                        <DropdownMenuItem
                          onClick={() => onChangeStatus(employee.id, 'probation')}
                          className="text-yellow-600 dark:text-yellow-400"
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          En prueba
                        </DropdownMenuItem>
                      )}
                      {employee.status !== 'suspended' && employee.status !== 'terminated' && (
                        <DropdownMenuItem
                          onClick={() => onChangeStatus(employee.id, 'suspended')}
                          className="text-orange-600 dark:text-orange-400"
                        >
                          <UserX className="h-4 w-4 mr-2" />
                          Suspender
                        </DropdownMenuItem>
                      )}
                      {employee.status !== 'terminated' && (
                        <DropdownMenuItem
                          onClick={() => onChangeStatus(employee.id, 'terminated')}
                          className="text-red-600 dark:text-red-400"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Terminar contrato
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

export default EmployeeTable;
