'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import type { AgingData } from './FinanzasDashboardService';

interface AgingChartProps {
  data: AgingData[];
  isLoading?: boolean;
  currencyCode?: string;
}

const agingColors = [
  'bg-green-500 dark:bg-green-600',
  'bg-yellow-500 dark:bg-yellow-600',
  'bg-orange-500 dark:bg-orange-600',
  'bg-red-500 dark:bg-red-600',
  'bg-red-700 dark:bg-red-800'
];

export function AgingChart({ data, isLoading, currencyCode = 'COP' }: AgingChartProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Antigüedad de Cartera (CxC)
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

  const totalCartera = data.reduce((sum, d) => sum + d.monto, 0);

  if (totalCartera === 0) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Antigüedad de Cartera (CxC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No hay cuentas por cobrar pendientes
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Antigüedad de Cartera (CxC)
          </CardTitle>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Total: {formatCurrency(totalCartera, currencyCode)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Barra de progreso apilada */}
          <div className="h-8 flex rounded-lg overflow-hidden">
            {data.map((item, index) => (
              item.porcentaje > 0 && (
                <div
                  key={index}
                  className={cn(
                    agingColors[index] || 'bg-gray-500',
                    'transition-all hover:opacity-80'
                  )}
                  style={{ width: `${item.porcentaje}%` }}
                  title={`${item.rango}: ${formatCurrency(item.monto, currencyCode)} (${item.porcentaje.toFixed(1)}%)`}
                />
              )
            ))}
          </div>

          {/* Leyenda */}
          <div className="space-y-2">
            {data.map((item, index) => (
              <div 
                key={index} 
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <div className={cn('w-3 h-3 rounded', agingColors[index] || 'bg-gray-500')} />
                  <span className="text-gray-700 dark:text-gray-300">{item.rango}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-600 dark:text-gray-400 w-20 text-right">
                    {item.porcentaje.toFixed(1)}%
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white w-32 text-right">
                    {formatCurrency(item.monto, currencyCode)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AgingChart;
