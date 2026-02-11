'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import type { VentaDetalle } from './ventasReportService';

interface VentasTableProps {
  data: VentaDetalle[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

const statusLabels: Record<string, { label: string; class: string }> = {
  completed: { label: 'Completada', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  pending: { label: 'Pendiente', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  cancelled: { label: 'Cancelada', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

const paymentLabels: Record<string, { label: string; class: string }> = {
  paid: { label: 'Pagado', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  pending: { label: 'Pendiente', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  partial: { label: 'Parcial', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
};

export function VentasTable({ data, total, page, pageSize, onPageChange, isLoading }: VentasTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Detalle de Ventas
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {total.toLocaleString('es-CO')} registros
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay ventas para los filtros seleccionados
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                  <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Sucursal</th>
                  <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Cliente</th>
                  <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Vendedor</th>
                  <th className="text-center py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="text-center py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">Pago</th>
                  <th className="text-right py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Impuesto</th>
                  <th className="text-right py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.map((sale) => {
                  const st = statusLabels[sale.status] || { label: sale.status, class: 'bg-gray-100 text-gray-600' };
                  const ps = paymentLabels[sale.payment_status] || { label: sale.payment_status, class: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={sale.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="py-2.5 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(sale.sale_date)}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-400">{sale.branch_name || '—'}</td>
                      <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-400 hidden md:table-cell truncate max-w-[140px]">
                        {sale.customer_name || '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-400 hidden lg:table-cell truncate max-w-[120px]">
                        {sale.seller_name || '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.class}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-center hidden sm:table-cell">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ps.class}`}>
                          {ps.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {formatCurrency(sale.tax_total)}
                      </td>
                      <td className="py-2.5 text-right text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {formatCurrency(sale.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  className="h-7 w-7 p-0 border-gray-300 dark:border-gray-600"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="h-7 w-7 p-0 border-gray-300 dark:border-gray-600"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
