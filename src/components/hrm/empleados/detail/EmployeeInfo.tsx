'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  MapPin,
  User,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface EmployeeInfoProps {
  employee: {
    employment_type: string;
    contract_type: string | null;
    contract_end_date: string | null;
    hire_date: string;
    probation_end_date: string | null;
    position_name: string | null;
    department_name: string | null;
    branch_name: string | null;
    manager_name: string | null;
    base_salary: number | null;
    salary_period: string;
    currency_code: string;
    work_hours_per_week: number;
    work_location: string | null;
  };
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  employee: 'Empleado',
  contractor: 'Contratista',
  intern: 'Practicante',
  temporary: 'Temporal',
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  indefinite: 'Indefinido',
  fixed_term: 'Término fijo',
  temporary: 'Temporal',
  internship: 'Pasantía',
  freelance: 'Freelance',
};

const SALARY_PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
  hourly: 'Por hora',
};

export function EmployeeInfo({ employee }: EmployeeInfoProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Información Laboral */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Información Laboral
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo de Empleo</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {EMPLOYMENT_TYPE_LABELS[employee.employment_type] || employee.employment_type}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo de Contrato</p>
              <p className="text-gray-900 dark:text-white font-medium">
                {employee.contract_type
                  ? CONTRACT_TYPE_LABELS[employee.contract_type] || employee.contract_type
                  : '-'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha de Ingreso</p>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <p className="text-gray-900 dark:text-white">{formatDate(employee.hire_date)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fin de Prueba</p>
              <p className="text-gray-900 dark:text-white">
                {formatDate(employee.probation_end_date)}
              </p>
            </div>
          </div>

          {employee.contract_end_date && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fin de Contrato</p>
              <p className="text-gray-900 dark:text-white">
                {formatDate(employee.contract_end_date)}
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cargo</p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {employee.position_name || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Departamento</p>
                <p className="text-gray-900 dark:text-white font-medium">
                  {employee.department_name || '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sede</p>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <p className="text-gray-900 dark:text-white">{employee.branch_name || '-'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Jefe Directo</p>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <p className="text-gray-900 dark:text-white">{employee.manager_name || '-'}</p>
              </div>
            </div>
          </div>

          {employee.work_location && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ubicación de Trabajo</p>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" />
                <p className="text-gray-900 dark:text-white">{employee.work_location}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compensación */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Compensación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Salario Base</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {employee.base_salary
                ? formatCurrency(employee.base_salary, employee.currency_code)
                : 'No definido'}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {SALARY_PERIOD_LABELS[employee.salary_period] || employee.salary_period}
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">Horas por Semana</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {employee.work_hours_per_week}h
            </span>
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Moneda</p>
            <Badge variant="outline">{employee.currency_code}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default EmployeeInfo;
