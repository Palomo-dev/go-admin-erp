'use client';

import type { LoanInstallment } from '@/lib/services/employeeLoansService';
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
import { Calendar, DollarSign, AlertTriangle } from 'lucide-react';

interface InstallmentsTableProps {
  installments: LoanInstallment[];
  currencyCode: string;
  onRegisterPayment: (installment: LoanInstallment) => void;
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
  overdue: 'Vencido',
};

export function InstallmentsTable({
  installments,
  currencyCode,
  onRegisterPayment,
  isLoading,
}: InstallmentsTableProps) {
  const today = new Date().toISOString().split('T')[0];

  const getStatus = (installment: LoanInstallment) => {
    if (installment.status === 'paid') return 'paid';
    if (installment.status === 'partial') return 'partial';
    if (installment.due_date < today) return 'overdue';
    return 'pending';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (installments.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Sin cuotas
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Las cuotas se generarán al aprobar el préstamo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">N°</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Vencimiento</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Cuota</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Capital</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Interés</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Pagado</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {installments.map((installment) => {
            const status = getStatus(installment);
            const isPaid = status === 'paid';
            const isOverdue = status === 'overdue';
            const remaining = installment.amount - (installment.amount_paid || 0);

            return (
              <TableRow
                key={installment.id}
                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  isOverdue ? 'bg-red-50 dark:bg-red-900/10' : ''
                }`}
              >
                <TableCell className="font-medium text-gray-900 dark:text-white">
                  {installment.installment_number}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {isOverdue && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-gray-900 dark:text-white ${isOverdue ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {formatDate(installment.due_date)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(installment.amount, currencyCode)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {formatCurrency(installment.principal_portion, currencyCode)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {formatCurrency(installment.interest_portion || 0, currencyCode)}
                </TableCell>
                <TableCell className="text-gray-900 dark:text-white">
                  {formatCurrency(installment.amount_paid || 0, currencyCode)}
                  {installment.paid_at && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(installment.paid_at)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[status]}>
                    {statusLabels[status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {!isPaid && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRegisterPayment(installment)}
                    >
                      <DollarSign className="mr-1 h-3 w-3" />
                      Registrar Pago
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
