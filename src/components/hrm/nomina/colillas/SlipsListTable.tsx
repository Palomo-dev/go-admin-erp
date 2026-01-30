'use client';

import { useRouter } from 'next/navigation';
import type { PayrollSlip } from '@/lib/services/payrollService';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Eye, MoreHorizontal, CheckCircle, DollarSign, Download, FileText } from 'lucide-react';

interface SlipsListTableProps {
  slips: PayrollSlip[];
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  onApprove: (slip: PayrollSlip) => void;
  onMarkPaid: (slip: PayrollSlip) => void;
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paid: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  paid: 'Pagado',
};

export function SlipsListTable({
  slips,
  selectedIds,
  onSelectChange,
  onApprove,
  onMarkPaid,
  isLoading,
}: SlipsListTableProps) {
  const router = useRouter();

  const handleViewSlip = (slip: PayrollSlip) => {
    router.push(`/app/hrm/nomina/colillas/${slip.id}`);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectChange(slips.filter(s => s.status === 'draft').map(s => s.id));
    } else {
      onSelectChange([]);
    }
  };

  const handleSelectOne = (slipId: string, checked: boolean) => {
    if (checked) {
      onSelectChange([...selectedIds, slipId]);
    } else {
      onSelectChange(selectedIds.filter(id => id !== slipId));
    }
  };

  const draftSlips = slips.filter(s => s.status === 'draft');
  const allDraftSelected = draftSlips.length > 0 && draftSlips.every(s => selectedIds.includes(s.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (slips.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          No hay colillas
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Las colillas se generan al ejecutar un cálculo de nómina.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="w-12">
              <Checkbox
                checked={allDraftSelected}
                onCheckedChange={handleSelectAll}
                disabled={draftSlips.length === 0}
              />
            </TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Empleado</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Periodo</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Run</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Bruto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Deducciones</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Neto</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slips.map((slip) => (
            <TableRow
              key={slip.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
              onClick={() => handleViewSlip(slip)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.includes(slip.id)}
                  onCheckedChange={(checked) => handleSelectOne(slip.id, !!checked)}
                  disabled={slip.status !== 'draft'}
                />
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {slip.employee_name}
                  </div>
                  {slip.employee_code && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {slip.employee_code}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {slip.period_name || '-'}
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                #{slip.run_number || '-'}
              </TableCell>
              <TableCell className="text-gray-900 dark:text-white font-medium">
                {formatCurrency(slip.gross_pay, slip.currency_code)}
              </TableCell>
              <TableCell className="text-red-600 dark:text-red-400">
                -{formatCurrency(slip.total_deductions, slip.currency_code)}
              </TableCell>
              <TableCell className="text-green-600 dark:text-green-400 font-bold">
                {formatCurrency(slip.net_pay, slip.currency_code)}
              </TableCell>
              <TableCell>
                <Badge className={statusColors[slip.status || 'draft']}>
                  {statusLabels[slip.status || 'draft']}
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
                    <DropdownMenuItem onClick={() => handleViewSlip(slip)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Ver detalle
                    </DropdownMenuItem>
                    {slip.status === 'draft' && (
                      <DropdownMenuItem onClick={() => onApprove(slip)}>
                        <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                        Aprobar
                      </DropdownMenuItem>
                    )}
                    {slip.status === 'approved' && (
                      <DropdownMenuItem onClick={() => onMarkPaid(slip)}>
                        <DollarSign className="mr-2 h-4 w-4 text-purple-600" />
                        Marcar pagado
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar PDF
                    </DropdownMenuItem>
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
