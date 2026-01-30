'use client';

import { useRouter } from 'next/navigation';
import type { PayrollPeriod } from '@/lib/services/payrollService';
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
  Play,
  CheckCircle,
  XCircle,
  Trash2,
  Calendar,
} from 'lucide-react';

interface PeriodsTableProps {
  periods: PayrollPeriod[];
  onChangeStatus: (period: PayrollPeriod, status: string) => void;
  onDelete: (period: PayrollPeriod) => void;
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  calculating: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  calculating: 'Calculando',
  reviewing: 'En Revisión',
  approved: 'Aprobado',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

const frequencyLabels: Record<string, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

export function PeriodsTable({
  periods,
  onChangeStatus,
  onDelete,
  isLoading,
}: PeriodsTableProps) {
  const router = useRouter();

  const handleViewDetail = (period: PayrollPeriod) => {
    router.push(`/app/hrm/nomina/periodos/${period.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No hay periodos
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Crea un nuevo periodo de nómina para comenzar.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">Periodo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Frecuencia</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Rango</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Empleados</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Bruto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Neto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.map((period) => (
            <TableRow
              key={period.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              onClick={() => handleViewDetail(period)}
            >
              <TableCell className="font-medium text-gray-900 dark:text-white">
                {period.name || '-'}
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {frequencyLabels[period.frequency] || period.frequency}
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                <div className="text-sm">
                  {formatDate(period.period_start)} - {formatDate(period.period_end)}
                </div>
                {period.payment_date && (
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    Pago: {formatDate(period.payment_date)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white">
                {period.total_employees || 0}
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white font-medium">
                {formatCurrency(period.total_gross || 0, 'COP')}
              </TableCell>
              <TableCell className="text-green-600 dark:text-green-400 font-medium">
                {formatCurrency(period.total_net || 0, 'COP')}
              </TableCell>
              <TableCell>
                <Badge className={statusColors[period.status || 'draft']}>
                  {statusLabels[period.status || 'draft']}
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
                    <DropdownMenuItem onClick={() => handleViewDetail(period)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Ver detalle
                    </DropdownMenuItem>
                    {period.status === 'draft' && (
                      <DropdownMenuItem onClick={() => handleViewDetail(period)}>
                        <Play className="mr-2 h-4 w-4" />
                        Ejecutar cálculo
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {period.status === 'reviewing' && (
                      <DropdownMenuItem onClick={() => onChangeStatus(period, 'approved')}>
                        <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                        Aprobar
                      </DropdownMenuItem>
                    )}
                    {period.status === 'approved' && (
                      <DropdownMenuItem onClick={() => onChangeStatus(period, 'paid')}>
                        <CheckCircle className="mr-2 h-4 w-4 text-purple-600" />
                        Marcar pagado
                      </DropdownMenuItem>
                    )}
                    {(period.status === 'draft' || period.status === 'calculating') && (
                      <>
                        <DropdownMenuItem onClick={() => onChangeStatus(period, 'cancelled')}>
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancelar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(period)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </>
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
