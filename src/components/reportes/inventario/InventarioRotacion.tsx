'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import type { RotacionProducto } from './inventarioReportService';

interface InventarioRotacionProps {
  data: RotacionProducto[];
  isLoading: boolean;
}

export function InventarioRotacion({ data, isLoading }: InventarioRotacionProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/20">
          <RefreshCw className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Rotación de Productos
        </h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay datos de rotación
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="text-left py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">Producto</th>
                <th className="text-right py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">Stock</th>
                <th className="text-right py-2 pr-2 text-xs font-medium text-gray-500 dark:text-gray-400">Vendidas</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Rotación</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, idx) => {
                const maxRot = data[0]?.rotacion || 1;
                const pct = maxRot > 0 ? (p.rotacion / maxRot) * 100 : 0;
                const rotColor = p.rotacion >= 1 ? 'text-green-600 dark:text-green-400' :
                  p.rotacion >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                return (
                  <tr key={p.product_id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2 pr-2">
                      <span className="w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px] flex items-center justify-center font-semibold">
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <div>
                        <span className="text-gray-800 dark:text-gray-200 font-medium text-xs">{p.product_name}</span>
                        {p.sku && <span className="text-[10px] text-gray-400 ml-1">({p.sku})</span>}
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 mt-1">
                        <div className="bg-teal-500 dark:bg-teal-400 h-1 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right text-xs text-gray-600 dark:text-gray-300">
                      {p.stock_actual.toLocaleString('es-CO')}
                    </td>
                    <td className="py-2 pr-2 text-right text-xs text-gray-600 dark:text-gray-300">
                      {p.unidades_vendidas.toLocaleString('es-CO')}
                    </td>
                    <td className={`py-2 text-right text-xs font-semibold ${rotColor}`}>
                      {p.rotacion.toFixed(2)}x
                    </td>
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
