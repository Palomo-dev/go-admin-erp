'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import type { VentasComprasData } from './FinanzasDashboardService';

interface VentasComprasChartProps {
  data: VentasComprasData[];
  isLoading?: boolean;
  currencyCode?: string;
}

export function VentasComprasChart({ data, isLoading, currencyCode = 'COP' }: VentasComprasChartProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Ventas vs Compras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Ventas vs Compras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No hay datos disponibles para el período seleccionado
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(
    ...data.map(d => Math.max(d.ventas, d.compras))
  );

  const totalVentas = data.reduce((sum, d) => sum + d.ventas, 0);
  const totalCompras = data.reduce((sum, d) => sum + d.compras, 0);

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Ventas vs Compras
          </CardTitle>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-600 dark:text-gray-400">Ventas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-600 dark:text-gray-400">Compras</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Gráfico de barras */}
          <div className="h-48 flex items-end gap-2">
            {data.map((item, index) => {
              const ventasHeight = maxValue > 0 ? (item.ventas / maxValue) * 100 : 0;
              const comprasHeight = maxValue > 0 ? (item.compras / maxValue) * 100 : 0;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-1 items-end h-40">
                    <div 
                      className="flex-1 bg-blue-500 dark:bg-blue-600 rounded-t transition-all hover:bg-blue-600 dark:hover:bg-blue-500"
                      style={{ height: `${ventasHeight}%`, minHeight: item.ventas > 0 ? '4px' : '0' }}
                      title={`Ventas: ${formatCurrency(item.ventas, currencyCode)}`}
                    />
                    <div 
                      className="flex-1 bg-red-500 dark:bg-red-600 rounded-t transition-all hover:bg-red-600 dark:hover:bg-red-500"
                      style={{ height: `${comprasHeight}%`, minHeight: item.compras > 0 ? '4px' : '0' }}
                      title={`Compras: ${formatCurrency(item.compras, currencyCode)}`}
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full text-center">
                    {item.fecha}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Ventas</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalVentas, currencyCode)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Compras</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(totalCompras, currencyCode)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default VentasComprasChart;
