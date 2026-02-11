'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Table, AlertCircle } from 'lucide-react';
import type { ReportResult } from './reportBuilderService';

interface ResultsPreviewProps {
  result: ReportResult | null;
  isLoading: boolean;
  error: string | null;
}

function formatCell(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString('es-CO');
    return value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const str = String(value);
  if (str.length > 60) return str.substring(0, 57) + '...';
  return str;
}

export function ResultsPreview({ result, isLoading, error }: ResultsPreviewProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800 p-5">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Error al ejecutar el reporte</span>
        </div>
        <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <Table className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona una fuente y haz clic en "Ejecutar" para ver los resultados</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Table className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Resultados</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {result.total.toLocaleString('es-CO')} {result.aggregated ? 'grupos' : 'registros'}
          </span>
        </div>
      </div>

      {result.rows.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay resultados para esta consulta</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {result.columns.map((col) => (
                  <th key={col} className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  {result.columns.map((col) => (
                    <td key={col} className="py-2 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatCell(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
