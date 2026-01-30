'use client';

import type { PayrollItem } from '@/lib/services/payrollService';
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
import { Trash2, ListOrdered } from 'lucide-react';

interface ItemsTableProps {
  items: PayrollItem[];
  currencyCode: string;
  onDelete?: (item: PayrollItem) => void;
  isLoading?: boolean;
  canEdit?: boolean;
}

const typeLabels: Record<string, string> = {
  earning: 'Devengado',
  deduction: 'Deducción',
  employer_contribution: 'Aporte Empleador',
};

const typeColors: Record<string, string> = {
  earning: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  deduction: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  employer_contribution: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function ItemsTable({
  items,
  currencyCode,
  onDelete,
  isLoading,
  canEdit = false,
}: ItemsTableProps) {
  // Group by type
  const earnings = items.filter(i => i.item_type === 'earning');
  const deductions = items.filter(i => i.item_type === 'deduction');
  const employerContributions = items.filter(i => i.item_type === 'employer_contribution');

  const totalEarnings = earnings.reduce((sum, i) => sum + i.amount, 0);
  const totalDeductions = deductions.reduce((sum, i) => sum + i.amount, 0);
  const totalEmployer = employerContributions.reduce((sum, i) => sum + i.amount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <ListOrdered className="mx-auto h-10 w-10 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Sin conceptos
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No hay conceptos registrados en esta colilla.
        </p>
      </div>
    );
  }

  const renderSection = (title: string, sectionItems: PayrollItem[], total: number, colorClass: string) => (
    <div className="mb-6">
      <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center justify-between">
        <span>{title}</span>
        <span className={colorClass}>
          {formatCurrency(total, currencyCode)}
        </span>
      </h4>
      <div className="rounded-md border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800">
              <TableHead className="text-gray-700 dark:text-gray-300">Código</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Concepto</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Cant.</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Tarifa</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Monto</TableHead>
              {canEdit && onDelete && (
                <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sectionItems.map((item) => (
              <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">
                  {item.code}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {item.name}
                  </div>
                  {item.notes && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.notes}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {item.quantity || '-'}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {item.rate ? formatCurrency(item.rate, currencyCode) : 
                   item.percentage ? `${item.percentage}%` : '-'}
                </TableCell>
                <TableCell className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(item.amount, currencyCode)}
                </TableCell>
                {canEdit && onDelete && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(item)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {earnings.length > 0 && renderSection(
        'Devengados',
        earnings,
        totalEarnings,
        'text-green-600 dark:text-green-400'
      )}
      
      {deductions.length > 0 && renderSection(
        'Deducciones',
        deductions,
        totalDeductions,
        'text-red-600 dark:text-red-400'
      )}
      
      {employerContributions.length > 0 && renderSection(
        'Aportes del Empleador',
        employerContributions,
        totalEmployer,
        'text-blue-600 dark:text-blue-400'
      )}
    </div>
  );
}
