'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { CalendarCheck } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { ReservaResumen } from './pmsReportService';

interface PMSReservasTableProps {
  data: ReservaResumen[];
  isLoading: boolean;
}

const statusLabels: Record<string, { label: string; class: string }> = {
  confirmed: { label: 'Confirmada', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  checked_in: { label: 'Check-in', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  checked_out: { label: 'Check-out', class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  cancelled: { label: 'Cancelada', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  pending: { label: 'Pendiente', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  no_show: { label: 'No Show', class: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
};

export function PMSReservasTable({ data, isLoading }: PMSReservasTableProps) {
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
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Detalle de Reservas</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {data.length} registros
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay reservas en este período</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Check-in</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Check-out</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Espacio</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Tipo</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Huésped</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">Canal</th>
                <th className="text-center py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-right py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Noches</th>
                <th className="text-right py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const st = statusLabels[r.status] || { label: r.status, class: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-2.5 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.checkin}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.checkout}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-400 hidden md:table-cell">{r.space_label}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{r.space_type_name}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-400 hidden lg:table-cell truncate max-w-[120px]">{r.customer_name || '—'}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">{r.channel}</td>
                    <td className="py-2.5 pr-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.class}`}>{st.label}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-xs text-gray-600 dark:text-gray-300">{r.noches}</td>
                    <td className="py-2.5 text-right text-xs font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(r.total_estimated)}</td>
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
