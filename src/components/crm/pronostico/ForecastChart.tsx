'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { ForecastData } from '@/components/crm/oportunidades/types';

interface ForecastChartProps {
  data: ForecastData[];
  isLoading?: boolean;
}

export function ForecastChart({ data, isLoading }: ForecastChartProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No hay datos de pronóstico disponibles
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.openAmount, d.wonAmount, d.goal || 0)),
    1
  );

  const formatPeriod = (period: string) => {
    if (period.includes('Q')) {
      const [year, quarter] = period.split('-');
      return `${quarter} ${year}`;
    }
    if (period.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = period.split('-');
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${months[parseInt(month) - 1]} ${year}`;
    }
    return period;
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white">Tendencia de Pronóstico</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Ganado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Ponderado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
            <span className="text-sm text-gray-600 dark:text-gray-400">En proceso</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-red-500 rounded-full" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Meta</span>
          </div>
        </div>

        {/* Gráfico de barras */}
        <div className="space-y-6">
          {data.slice(-6).map((item) => (
            <div key={item.period} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatPeriod(item.period)}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {item.goalCompletion.toFixed(0)}% meta
                </span>
              </div>

              <div className="relative h-10 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                {/* Meta como línea vertical */}
                {item.goal > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                    style={{ left: `${Math.min((item.goal / maxValue) * 100, 100)}%` }}
                  />
                )}

                {/* Barra de abierto (fondo) */}
                <div
                  className="absolute inset-y-0 left-0 bg-gray-300 dark:bg-gray-600 transition-all duration-300"
                  style={{ width: `${(item.openAmount / maxValue) * 100}%` }}
                />

                {/* Barra ponderada */}
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-300"
                  style={{ width: `${(item.weightedAmount / maxValue) * 100}%` }}
                />

                {/* Barra ganada */}
                <div
                  className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-300"
                  style={{ width: `${(item.wonAmount / maxValue) * 100}%` }}
                />

                {/* Valores */}
                <div className="absolute inset-0 flex items-center justify-end pr-3">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 px-1 rounded">
                    {formatCurrency(item.wonAmount + item.weightedAmount)}
                  </span>
                </div>
              </div>

              {/* Detalle */}
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Ganado: {formatCurrency(item.wonAmount)}</span>
                <span>Pond.: {formatCurrency(item.weightedAmount)}</span>
                <span>Abierto: {formatCurrency(item.openAmount)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Totales */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(data.reduce((sum, d) => sum + d.wonAmount, 0))}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Ganado</p>
          </div>
          <div>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(data.reduce((sum, d) => sum + d.weightedAmount, 0))}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Ponderado</p>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-600 dark:text-gray-400">
              {formatCurrency(data.reduce((sum, d) => sum + d.openAmount, 0))}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Abierto</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
