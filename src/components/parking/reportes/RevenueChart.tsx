'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { RevenueByPeriod } from '@/lib/services/parkingReportService';

interface RevenueChartProps {
  data: RevenueByPeriod[];
  isLoading?: boolean;
}

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  const formatDate = (period: string) => {
    const date = new Date(period);
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            Ingresos por Período
          </CardTitle>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
            Total: {formatCurrency(totalRevenue)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            No hay datos para el período seleccionado
          </div>
        ) : (
          <div className="h-64 flex items-end gap-2 overflow-x-auto pb-6">
            {data.map((item, index) => {
              const height = (item.revenue / maxRevenue) * 100;

              return (
                <div
                  key={index}
                  className="flex-shrink-0 w-16 flex flex-col items-center group relative"
                >
                  {/* Tooltip */}
                  <div className="hidden group-hover:block absolute -top-20 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded px-2 py-1 z-10 whitespace-nowrap">
                    <p className="font-semibold">{formatDate(item.period)}</p>
                    <p>{formatCurrency(item.revenue)}</p>
                    <p>{item.sessions} sesiones</p>
                  </div>

                  {/* Valor */}
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {formatCurrency(item.revenue, true)}
                  </span>

                  {/* Barra */}
                  <div
                    className="w-10 rounded-t bg-gradient-to-t from-green-600 to-green-400 dark:from-green-700 dark:to-green-500 transition-all duration-300 cursor-pointer hover:opacity-80"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />

                  {/* Etiqueta */}
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 text-center">
                    {formatDate(item.period)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RevenueChart;
