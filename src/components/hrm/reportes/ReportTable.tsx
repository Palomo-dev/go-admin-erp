'use client';

import { formatCurrency, formatDate } from '@/utils/Utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

interface ReportTableProps {
  reportType: string;
  data: any[];
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  active: 'Activo',
  paid: 'Pagado',
  draft: 'Borrador',
};

export function ReportTable({
  reportType,
  data,
  isLoading,
}: ReportTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Sin resultados
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No hay datos para los filtros seleccionados.
        </p>
      </div>
    );
  }

  // Attendance Report
  if (reportType === 'attendance') {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Departamento</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Fecha</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Entrada</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Programado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Trabajado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Extras</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Tardanza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {row.employee_name}
                  </div>
                  {row.employee_code && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {row.employee_code}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {row.department || '-'}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {formatDate(row.work_date)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {row.first_check_in ? new Date(row.first_check_in).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '-'}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {Math.round(row.scheduled_minutes / 60 * 10) / 10}h
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white font-medium">
                  {Math.round(row.worked_minutes / 60 * 10) / 10}h
                </TableCell>
                <TableCell className="text-blue-600 dark:text-blue-400">
                  {row.overtime_minutes > 0 ? `+${Math.round(row.overtime_minutes / 60 * 10) / 10}h` : '-'}
                </TableCell>
                <TableCell className={row.late_minutes > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}>
                  {row.late_minutes > 0 ? `${row.late_minutes} min` : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Absences Report
  if (reportType === 'absences') {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Departamento</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Tipo</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Desde</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Hasta</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Días</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {row.employee_name}
                  </div>
                  {row.employee_code && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {row.employee_code}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {row.department || '-'}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {row.leave_type}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {formatDate(row.start_date)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {formatDate(row.end_date)}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white font-medium">
                  {row.days}
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[row.status] || statusColors.pending}>
                    {statusLabels[row.status] || row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Payroll Report
  if (reportType === 'payroll') {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Departamento</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Periodo</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Bruto</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Deducciones</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Neto</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {row.employee_name}
                  </div>
                  {row.employee_code && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {row.employee_code}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {row.department || '-'}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {row.period_name}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white font-medium">
                  {formatCurrency(row.gross_pay, row.currency_code)}
                </TableCell>
                <TableCell className="text-red-600 dark:text-red-400">
                  -{formatCurrency(row.total_deductions, row.currency_code)}
                </TableCell>
                <TableCell className="text-green-600 dark:text-green-400 font-bold">
                  {formatCurrency(row.net_pay, row.currency_code)}
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[row.status] || statusColors.draft}>
                    {statusLabels[row.status] || row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Loans Report
  if (reportType === 'loans') {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">N° Préstamo</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Tipo</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Principal</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Total</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Saldo</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Cuotas</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {row.employee_name}
                  </div>
                  {row.employee_code && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {row.employee_code}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">
                  {row.loan_number || '-'}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {row.loan_type || '-'}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {formatCurrency(row.principal, row.currency_code)}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white font-medium">
                  {formatCurrency(row.total_amount, row.currency_code)}
                </TableCell>
                <TableCell className="text-blue-600 dark:text-blue-400 font-medium">
                  {formatCurrency(row.balance, row.currency_code)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {row.installments_paid}/{row.installments_total}
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[row.status] || statusColors.pending}>
                    {statusLabels[row.status] || row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return null;
}
