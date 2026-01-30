'use client';

import { useRouter } from 'next/navigation';
import type { PayrollSlip } from '@/lib/services/payrollService';
import { formatCurrency } from '@/utils/Utils';
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
import { Eye, FileText } from 'lucide-react';

interface SlipsTableProps {
  slips: PayrollSlip[];
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
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

export function SlipsTable({
  slips,
  selectedIds,
  onSelectChange,
  isLoading,
}: SlipsTableProps) {
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
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (slips.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="mx-auto h-10 w-10 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Sin colillas
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Las colillas se generarán al ejecutar el cálculo.
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
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <TableCell>
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
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewSlip(slip)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Ver
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
