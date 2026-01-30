'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn, formatDate } from '@/utils/Utils';
import { Users, UserPlus, ChevronRight, Mail } from 'lucide-react';
import Link from 'next/link';

export interface DepartmentEmployee {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  position_name: string | null;
  status: string;
  hire_date: string;
  avatar_url: string | null;
}

interface DepartmentEmployeesProps {
  employees: DepartmentEmployee[];
  departmentId: string;
  isLoading?: boolean;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: {
    label: 'Activo',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  inactive: {
    label: 'Inactivo',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  },
  on_leave: {
    label: 'Permiso',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  terminated: {
    label: 'Terminado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

export function DepartmentEmployees({
  employees,
  departmentId,
  isLoading,
}: DepartmentEmployeesProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Users className="h-5 w-5 text-blue-600" />
            Empleados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                  <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Users className="h-5 w-5 text-blue-600" />
          Empleados
          <Badge variant="secondary">{employees.length}</Badge>
        </CardTitle>
        <Link href={`/app/hrm/empleados/nuevo?department=${departmentId}`}>
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Agregar
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No hay empleados en este departamento
            </p>
            <Link href={`/app/hrm/empleados/nuevo?department=${departmentId}`}>
              <Button variant="outline" size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Agregar Empleado
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Ingreso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => {
                  const status = statusConfig[employee.status] || statusConfig.inactive;
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={employee.avatar_url || undefined} />
                            <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                              {getInitials(employee.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {employee.full_name}
                            </p>
                            {employee.email && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {employee.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-700 dark:text-gray-300">
                          {employee.position_name || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600 dark:text-gray-400 text-sm">
                          {formatDate(employee.hire_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs', status.color)}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/app/hrm/empleados/${employee.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DepartmentEmployees;
