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
      <div className="text-center py-12">
        <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay empleados
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          No se encontraron empleados con los filtros aplicados
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead className="font-semibold">Empleado</TableHead>
            <TableHead className="font-semibold">Código</TableHead>
            <TableHead className="font-semibold">Cargo / Depto.</TableHead>
            <TableHead className="font-semibold">Sede</TableHead>
            <TableHead className="font-semibold">Contrato</TableHead>
            <TableHead className="font-semibold text-center">Estado</TableHead>
            <TableHead className="font-semibold text-right">Salario</TableHead>
            <TableHead className="w-[60px]"></TableHead>
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
                className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                onClick={() => onView(employee.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={employee.avatar_url || undefined} alt={employee.full_name} />
                      <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {getInitials(employee.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {employee.full_name}
                      </span>
                      {employee.email && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {employee.email}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                    {employee.employee_code || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-gray-900 dark:text-white">
                      {employee.position_name || '-'}
                    </span>
                    {employee.department_name && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {employee.department_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-gray-600 dark:text-gray-300">
                    {employee.branch_name || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-gray-900 dark:text-white">{contractLabel}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Desde {formatDate(employee.hire_date)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className={statusConfig.className}>
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {employee.base_salary
                      ? formatCurrency(employee.base_salary, employee.currency_code)
                      : '-'}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
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
  );
}

export default EmployeeTable;
