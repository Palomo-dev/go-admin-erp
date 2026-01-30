'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { FlujoProyectado } from './FinanzasDashboardService';

interface FlujoProyectadoChartProps {
  data: FlujoProyectado[];
  isLoading?: boolean;
  currencyCode?: string;
}

export function FlujoProyectadoChart({ data, isLoading, currencyCode = 'COP' }: FlujoProyectadoChartProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Flujo de Caja Proyectado
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
            Flujo de Caja Proyectado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No hay datos de flujo proyectado
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(
    ...data.map(d => Math.max(Math.abs(d.ingresos), Math.abs(d.egresos), Math.abs(d.saldo)))
  );

  let saldoAcumulado = 0;

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Flujo de Caja Proyectado (6 meses)
          </CardTitle>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-600 dark:text-gray-400">Ingresos</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-600 dark:text-gray-400">Egresos</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-600 dark:text-gray-400">Saldo</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 px-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Mes</th>
                <th className="py-2 px-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Ingresos</th>
                <th className="py-2 px-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Egresos</th>
                <th className="py-2 px-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Saldo</th>
                <th className="py-2 px-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Acumulado</th>
                <th className="py-2 px-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => {
                saldoAcumulado += item.saldo;
                const tendencia = item.saldo > 0 ? 'up' : item.saldo < 0 ? 'down' : 'neutral';
                
                return (
                  <tr 
                    key={index} 
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="py-3 px-3 text-sm font-medium text-gray-900 dark:text-white">
                      {item.mes}
                    </td>
                    <td className="py-3 px-3 text-sm text-right text-green-600 dark:text-green-400">
                      {formatCurrency(item.ingresos, currencyCode)}
                    </td>
                    <td className="py-3 px-3 text-sm text-right text-red-600 dark:text-red-400">
                      {formatCurrency(item.egresos, currencyCode)}
                    </td>
                    <td className={cn(
                      'py-3 px-3 text-sm text-right font-medium',
                      item.saldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {formatCurrency(item.saldo, currencyCode)}
                    </td>
                    <td className={cn(
                      'py-3 px-3 text-sm text-right font-bold',
                      saldoAcumulado >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {formatCurrency(saldoAcumulado, currencyCode)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {tendencia === 'up' && (
                        <TrendingUp className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                      {tendencia === 'down' && (
                        <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />
                      )}
                      {tendencia === 'neutral' && (
                        <Minus className="h-4 w-4 text-gray-400 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Gráfico de líneas simplificado */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="h-16 flex items-end gap-1">
            {data.map((item, index) => {
              const height = maxValue > 0 ? (Math.abs(item.saldo) / maxValue) * 100 : 0;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className={cn(
                      'w-full rounded-t transition-all',
                      item.saldo >= 0 ? 'bg-blue-500 dark:bg-blue-600' : 'bg-red-500 dark:bg-red-600'
                    )}
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default FlujoProyectadoChart;
