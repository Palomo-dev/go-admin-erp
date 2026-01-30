'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Edit,
  MoreVertical,
  UserCheck,
  UserX,
  Clock,
  XCircle,
  Mail,
  Phone,
  Building2,
  Briefcase,
} from 'lucide-react';

interface EmployeeHeaderProps {
  employee: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    employee_code: string | null;
    status: string;
    position_name: string | null;
    department_name: string | null;
    branch_name: string | null;
    hire_date: string;
  };
  onEdit: () => void;
  onChangeStatus: (status: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Activo',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  probation: {
    label: 'En prueba',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  suspended: {
    label: 'Suspendido',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  terminated: {
    label: 'Terminado',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

export function EmployeeHeader({ employee, onEdit, onChangeStatus }: EmployeeHeaderProps) {
  const statusConfig = STATUS_CONFIG[employee.status] || STATUS_CONFIG.active;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        {/* Info Principal */}
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={employee.avatar_url || undefined} alt={employee.full_name} />
            <AvatarFallback className="text-2xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {getInitials(employee.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {employee.full_name}
              </h1>
              <Badge variant="secondary" className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
            </div>

            {employee.employee_code && (
              <p className="text-sm font-mono text-gray-500 dark:text-gray-400 mt-1">
                {employee.employee_code}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
              {employee.position_name && (
                <div className="flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  <span>{employee.position_name}</span>
                </div>
              )}
              {employee.department_name && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  <span>{employee.department_name}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
              {employee.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  <a
                    href={`mailto:${employee.email}`}
                    className="hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {employee.email}
                  </a>
                </div>
              )}
              {employee.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  <a
                    href={`tel:${employee.phone}`}
                    className="hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {employee.phone}
                  </a>
                </div>
              )}
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Fecha de ingreso: {formatDate(employee.hire_date)}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <Button onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Cambiar Estado</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {employee.status !== 'active' && (
                <DropdownMenuItem
                  onClick={() => onChangeStatus('active')}
                  className="text-green-600 dark:text-green-400"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Activar
                </DropdownMenuItem>
              )}
              {employee.status !== 'probation' && employee.status !== 'terminated' && (
                <DropdownMenuItem
                  onClick={() => onChangeStatus('probation')}
                  className="text-yellow-600 dark:text-yellow-400"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  En prueba
                </DropdownMenuItem>
              )}
              {employee.status !== 'suspended' && employee.status !== 'terminated' && (
                <DropdownMenuItem
                  onClick={() => onChangeStatus('suspended')}
                  className="text-orange-600 dark:text-orange-400"
                >
                  <UserX className="h-4 w-4 mr-2" />
                  Suspender
                </DropdownMenuItem>
              )}
              {employee.status !== 'terminated' && (
                <DropdownMenuItem
                  onClick={() => onChangeStatus('terminated')}
                  className="text-red-600 dark:text-red-400"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Terminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default EmployeeHeader;
