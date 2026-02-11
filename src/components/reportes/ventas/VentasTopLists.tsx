'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Package, Users } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { TopProductoVenta, TopClienteVenta } from './ventasReportService';

// ─── Top Productos ───────────────────────────────────────────────────────────

interface TopProductosProps {
  data: TopProductoVenta[];
  isLoading: boolean;
}

export function VentasTopProductos({ data, isLoading }: TopProductosProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
          <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Top Productos
        </h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay datos de productos
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="text-left py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">Producto</th>
                <th className="text-left py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">Categoría</th>
                <th className="text-right py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">Cant.</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, idx) => {
                const maxRevenue = data[0]?.revenue || 1;
                const pct = (p.revenue / maxRevenue) * 100;
                return (
                  <tr key={p.product_id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2 pr-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] flex items-center justify-center font-semibold">
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <div>
                        <span className="text-gray-800 dark:text-gray-200 font-medium text-xs">{p.name}</span>
                        {p.sku && <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">({p.sku})</span>}
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 mt-1">
                        <div className="bg-blue-500 dark:bg-blue-400 h-1 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">{p.category_name || '—'}</td>
                    <td className="py-2 pr-2 text-right text-xs text-gray-600 dark:text-gray-300">{p.quantity.toLocaleString('es-CO')}</td>
                    <td className="py-2 text-right text-xs font-medium text-gray-800 dark:text-gray-200">{formatCurrency(p.revenue)}</td>
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

// ─── Top Clientes ────────────────────────────────────────────────────────────

interface TopClientesProps {
  data: TopClienteVenta[];
  isLoading: boolean;
}

export function VentasTopClientes({ data, isLoading }: TopClientesProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
          <Users className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Top Clientes
        </h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay datos de clientes
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((c, idx) => {
            const maxTotal = data[0]?.total || 1;
            const pct = (c.total / maxTotal) * 100;
            return (
              <div key={c.customer_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-[10px] flex items-center justify-center font-semibold">
                      {idx + 1}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate text-xs">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{c.count} compras</span>
                    <span className="font-medium text-xs text-gray-800 dark:text-gray-200">{formatCurrency(c.total)}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-cyan-500 dark:bg-cyan-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
