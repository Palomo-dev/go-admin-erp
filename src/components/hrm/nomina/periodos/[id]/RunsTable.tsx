'use client';

import { useRouter } from 'next/navigation';
import type { PayrollRun } from '@/lib/services/payrollService';
import { formatDate } from '@/utils/Utils';
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
import { Eye, CheckCircle, Play } from 'lucide-react';

interface RunsTableProps {
  runs: PayrollRun[];
  periodId: string;
  onMarkFinal: (run: PayrollRun) => void;
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  calculating: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  superseded: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const statusLabels: Record<string, string> = {
  calculating: 'Calculando',
  completed: 'Completado',
  error: 'Error',
  superseded: 'Reemplazado',
};

export function RunsTable({
  runs,
  periodId,
  onMarkFinal,
  isLoading,
}: RunsTableProps) {
  const router = useRouter();

  const handleViewRun = (run: PayrollRun) => {
    router.push(`/app/hrm/nomina/periodos/${periodId}/runs/${run.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8">
        <Play className="mx-auto h-10 w-10 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
          Sin ejecuciones
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ejecute el cálculo de nómina para generar las colillas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800">
            <TableHead className="text-gray-700 dark:text-gray-300">Run #</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Ejecutado</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="text-gray-700 dark:text-gray-300">Final</TableHead>
            <TableHead className="text-right text-gray-700 dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <TableCell className="font-medium text-gray-900 dark:text-white">
                #{run.run_number}
              </TableCell>
              <TableCell className="text-gray-600 dark:text-gray-400">
                {run.executed_at ? formatDate(run.executed_at) : '-'}
              </TableCell>
              <TableCell>
                <Badge className={statusColors[run.status || 'calculating']}>
                  {statusLabels[run.status || 'calculating']}
                </Badge>
              </TableCell>
              <TableCell>
                {run.is_final ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Final
                  </Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewRun(run)}
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Ver
                  </Button>
                  {run.status === 'completed' && !run.is_final && (
                    <Button
                      size="sm"
                      onClick={() => onMarkFinal(run)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Marcar Final
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
