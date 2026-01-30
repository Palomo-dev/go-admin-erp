'use client';

import { FC } from 'react';
import { cn, formatCurrency } from '@/utils/Utils';
import { Building2, Package, AlertTriangle, PackageX, TrendingUp } from 'lucide-react';
import { BranchSummary } from '@/lib/services/inventoryDashboardService';

interface ResumenSucursalesProps {
  summaries: BranchSummary[];
  isLoading?: boolean;
  className?: string;
}

const ResumenSucursales: FC<ResumenSucursalesProps> = ({ summaries, isLoading, className }) => {
  if (isLoading) {
    return (
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
        className
      )}>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-500" />
          Resumen por Sucursal
        </h3>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
        className
      )}>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-500" />
          Resumen por Sucursal
        </h3>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No hay sucursales configuradas</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
      className
    )}>
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
        <Building2 className="h-5 w-5 text-blue-500" />
        Resumen por Sucursal
      </h3>
      
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {summaries.map((summary) => (
          <div
            key={summary.branchId}
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                {summary.branchName}
              </h4>
              {(summary.outOfStockCount > 0 || summary.lowStockCount > 0) && (
                <div className="flex gap-1">
                  {summary.outOfStockCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1">
                      <PackageX className="h-3 w-3" />
                      {summary.outOfStockCount}
                    </span>
                  )}
                  {summary.lowStockCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {summary.lowStockCount}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Stock Total</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {summary.totalStock.toLocaleString('es-CO')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Valor Inventario</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(summary.inventoryValue)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResumenSucursales;
