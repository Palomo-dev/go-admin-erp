'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Package, Building, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { TopProducto, TopSucursal } from './reportesService';

interface TopProductosProps {
  data: TopProducto[];
  isLoading: boolean;
}

interface TopSucursalesProps {
  data: TopSucursal[];
  isLoading: boolean;
}

export function ReportesTopProductos({ data, isLoading }: TopProductosProps) {
  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
          <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Top Productos del Mes
        </h3>
      </div>

      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay datos de productos
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((product, index) => {
            const maxRevenue = data[0]?.revenue || 1;
            const pct = (product.revenue / maxRevenue) * 100;

            return (
              <div key={product.product_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">
                      {product.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {product.quantity} uds
                    </span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {formatCurrency(product.revenue)}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 dark:bg-blue-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ReportesTopSucursales({ data, isLoading }: TopSucursalesProps) {
  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
          <Building className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Top Sucursales del Mes
        </h3>
      </div>

      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay datos de sucursales
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((branch, index) => {
            const maxTotal = data[0]?.total || 1;
            const pct = (branch.total / maxTotal) * 100;

            return (
              <div key={branch.branch_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-center font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">
                      {branch.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {branch.count} ventas
                    </span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {formatCurrency(branch.total)}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 dark:bg-emerald-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
