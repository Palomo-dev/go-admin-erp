'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Store } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { VentaSucursalPos } from '@/lib/services/posDashboardService';

interface VentasPorSucursalProps {
  sucursales: VentaSucursalPos[];
  isLoading?: boolean;
}

export function VentasPorSucursal({ sucursales, isLoading }: VentasPorSucursalProps) {
  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Store className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          Ventas por sucursal
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sucursales.length === 0 ? (
          <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            Sin datos en el período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2 pr-4 font-medium">Sucursal</th>
                  <th className="py-2 px-4 font-medium text-center">Transacciones</th>
                  <th className="py-2 pl-4 font-medium text-right">Total ventas</th>
                </tr>
              </thead>
              <tbody>
                {sucursales.map((s) => (
                  <tr
                    key={s.branchId}
                    className="border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                  >
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                      {s.branchName}
                    </td>
                    <td className="py-2 px-4 text-center text-gray-700 dark:text-gray-300">
                      {s.numTransacciones}
                    </td>
                    <td className="py-2 pl-4 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(s.totalVentas, 'COP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default VentasPorSucursal;
