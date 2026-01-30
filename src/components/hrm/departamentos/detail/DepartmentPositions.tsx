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
import { cn, formatCurrency } from '@/utils/Utils';
import { Briefcase, Plus, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';

export interface DepartmentPosition {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  level: string | null;
  min_salary: number | null;
  max_salary: number | null;
  is_active: boolean;
  employee_count: number;
}

interface DepartmentPositionsProps {
  positions: DepartmentPosition[];
  departmentId: string;
  isLoading?: boolean;
}

const levelConfig: Record<string, { label: string; color: string }> = {
  junior: {
    label: 'Junior',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  mid: {
    label: 'Mid',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  senior: {
    label: 'Senior',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  lead: {
    label: 'Lead',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
  manager: {
    label: 'Manager',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

export function DepartmentPositions({
  positions,
  departmentId,
  isLoading,
}: DepartmentPositionsProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Cargos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-gray-100 dark:bg-gray-700 rounded" />
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
          <Briefcase className="h-5 w-5 text-blue-600" />
          Cargos
          <Badge variant="secondary">{positions.length}</Badge>
        </CardTitle>
        <Link href={`/app/hrm/cargos/nuevo?department=${departmentId}`}>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Cargo
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Briefcase className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No hay cargos definidos en este departamento
            </p>
            <Link href={`/app/hrm/cargos/nuevo?department=${departmentId}`}>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Crear Cargo
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Rango Salarial</TableHead>
                  <TableHead>Empleados</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => {
                  const level = position.level
                    ? levelConfig[position.level] || { label: position.level, color: 'bg-gray-100 text-gray-800' }
                    : null;
                  return (
                    <TableRow key={position.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {position.name}
                          </p>
                          {position.code && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {position.code}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {level ? (
                          <Badge className={cn('text-xs', level.color)}>
                            {level.label}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {position.min_salary || position.max_salary ? (
                          <span className="text-gray-700 dark:text-gray-300 text-sm">
                            {position.min_salary && formatCurrency(position.min_salary)}
                            {position.min_salary && position.max_salary && ' - '}
                            {position.max_salary && formatCurrency(position.max_salary)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                          <Users className="h-4 w-4" />
                          {position.employee_count}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={position.is_active ? 'default' : 'secondary'}
                          className={cn(
                            'text-xs',
                            position.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : ''
                          )}
                        >
                          {position.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/app/hrm/cargos/${position.id}`}>
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

export default DepartmentPositions;
