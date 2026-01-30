'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Eye, UserPlus } from 'lucide-react';
import Link from 'next/link';

export interface JobPositionEmployee {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  hire_date: string | null;
  status: string;
}

interface JobPositionEmployeesProps {
  employees: JobPositionEmployee[];
  positionId: string;
}

export function JobPositionEmployees({ employees, positionId }: JobPositionEmployeesProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      active: {
        label: 'Activo',
        className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      },
      inactive: {
        label: 'Inactivo',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      },
      on_leave: {
        label: 'En licencia',
        className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      },
      terminated: {
        label: 'Terminado',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      },
    };

    const config = statusConfig[status] || statusConfig.inactive;
    return (
      <Badge variant="secondary" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
            <Users className="h-5 w-5 text-blue-600" />
            Empleados en este Cargo
            <Badge variant="secondary" className="ml-2">
              {employees.length}
            </Badge>
          </CardTitle>
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Asignar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {employees.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              No hay empleados asignados a este cargo
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                  <TableHead className="font-semibold">Empleado</TableHead>
                  <TableHead className="font-semibold">Código</TableHead>
                  <TableHead className="font-semibold">Fecha Ingreso</TableHead>
                  <TableHead className="font-semibold text-center">Estado</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                        {employee.employee_code || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-600 dark:text-gray-300">
                        {formatDate(employee.hire_date)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(employee.status)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/app/hrm/empleados/${employee.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default JobPositionEmployees;
