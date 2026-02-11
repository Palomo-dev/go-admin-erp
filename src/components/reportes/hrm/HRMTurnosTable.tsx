'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { CalendarCheck } from 'lucide-react';
import type { TurnoResumen } from './hrmReportService';

interface HRMTurnosTableProps {
  data: TurnoResumen[];
  isLoading: boolean;
}

const statusLabels: Record<string, { label: string; class: string }> = {
  scheduled: { label: 'Programado', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  completed: { label: 'Cumplido', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  worked: { label: 'Cumplido', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  missed: { label: 'Falta', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  absent: { label: 'Ausente', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  swapped: { label: 'Cambiado', class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  cancelled: { label: 'Cancelado', class: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
};

export function HRMTurnosTable({ data, isLoading }: HRMTurnosTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <CalendarCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Detalle de Turnos</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {data.length} registros
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay turnos en este período</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Empleado</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Depto.</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Sucursal</th>
                <th className="text-center py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-right py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">Entrada Real</th>
                <th className="text-right py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">Salida Real</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => {
                const st = statusLabels[t.status] || { label: t.status, class: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={t.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-2.5 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{t.work_date}</td>
                    <td className="py-2.5 pr-3 text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px]">{t.employee_name}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{t.department_name}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{t.branch_name}</td>
                    <td className="py-2.5 pr-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.class}`}>{st.label}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-xs text-gray-600 dark:text-gray-300 hidden sm:table-cell">{t.actual_start || '—'}</td>
                    <td className="py-2.5 text-right text-xs text-gray-600 dark:text-gray-300 hidden sm:table-cell">{t.actual_end || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
