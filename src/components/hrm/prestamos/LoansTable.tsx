'use client';

import { useRouter } from 'next/navigation';
import type { EmployeeLoan } from '@/lib/services/employeeLoansService';
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
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Trash2,
  Banknote,
} from 'lucide-react';

interface LoansTableProps {
  loans: EmployeeLoan[];
  onEdit: (loan: EmployeeLoan) => void;
  onApprove: (loan: EmployeeLoan) => void;
  onReject: (loan: EmployeeLoan) => void;
  onCancel: (loan: EmployeeLoan) => void;
  onDelete: (loan: EmployeeLoan) => void;
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  defaulted: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  written_off: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  requested: 'Solicitado',
  approved: 'Aprobado',
  active: 'Activo',
  paid: 'Pagado',
  cancelled: 'Cancelado',
  defaulted: 'En mora',
  written_off: 'Castigado',
};

const loanTypeLabels: Record<string, string> = {
  general: 'General',
  advance: 'Anticipo',
  emergency: 'Emergencia',
  education: 'Educación',
  housing: 'Vivienda',
  vehicle: 'Vehículo',
  calamity: 'Calamidad',
};

export function LoansTable({
  loans,
  onEdit,
  onApprove,
  onReject,
  onCancel,
  onDelete,
  isLoading,
}: LoansTableProps) {
  const router = useRouter();

  const handleViewDetail = (loan: EmployeeLoan) => {
    router.push(`/app/hrm/prestamos/${loan.id}`);
  };

  const getProgress = (loan: EmployeeLoan) => {
    if (loan.total_amount === 0) return 0;
    const paid = loan.total_amount - loan.balance;
    return (paid / loan.total_amount) * 100;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (loans.length === 0) {
    return (
      <div className="text-center py-12">
        <Banknote className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No hay préstamos
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Crea un nuevo préstamo para comenzar.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">N° Préstamo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Tipo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Monto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Saldo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Progreso</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loans.map((loan) => (
            <TableRow
              key={loan.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              onClick={() => handleViewDetail(loan)}
            >
              <TableCell className="font-mono text-sm text-gray-900 dark:text-white">
                {loan.loan_number || '-'}
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {loan.employee_name}
                  </div>
                  {loan.employee_code && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {loan.employee_code}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {loanTypeLabels[loan.loan_type || 'general'] || loan.loan_type}
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white font-medium">
                {formatCurrency(loan.total_amount, loan.currency_code)}
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white">
                {formatCurrency(loan.balance, loan.currency_code)}
              </TableCell>
              <TableCell>
                <div className="w-24">
                  <Progress value={getProgress(loan)} className="h-2" />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {loan.installments_paid || 0} / {loan.installments_total} cuotas
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={statusColors[loan.status || 'requested']}>
                  {statusLabels[loan.status || 'requested']}
                </Badge>
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800">
                    <DropdownMenuItem onClick={() => handleViewDetail(loan)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Ver detalle
                    </DropdownMenuItem>
                    {loan.status === 'requested' && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(loan)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onApprove(loan)}>
                          <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                          Aprobar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onReject(loan)}>
                          <XCircle className="mr-2 h-4 w-4 text-red-600" />
                          Rechazar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(loan)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </>
                    )}
                    {loan.status === 'active' && (
                      <DropdownMenuItem onClick={() => onCancel(loan)}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancelar préstamo
                      </DropdownMenuItem>
                    )}
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
