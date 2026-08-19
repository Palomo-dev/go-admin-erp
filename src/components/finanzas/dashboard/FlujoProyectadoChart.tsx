'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { FlujoProyectado } from './FinanzasDashboardService';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';

interface FlujoProyectadoChartProps {
  data: FlujoProyectado[];
  isLoading?: boolean;
  currencyCode?: string;
}

export function FlujoProyectadoChart({ data, isLoading, currencyCode = 'COP' }: FlujoProyectadoChartProps) {
  const [view, setView] = useState<'tabla' | 'grafico'>('grafico');

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Flujo de Caja Proyectado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
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

  // Calcular saldo acumulado
  let saldoAcumulado = 0;
  const chartData = data.map((item) => {
    saldoAcumulado += item.saldo;
    return {
      ...item,
      acumulado: saldoAcumulado,
    };
  });

  // Tooltip personalizado
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1.5">
        <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">{label}</p>
        <p className="flex items-center justify-between gap-4">
          <span className="text-green-600 dark:text-green-400">Ingresos:</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(item.ingresos, currencyCode)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-4">
          <span className="text-red-600 dark:text-red-400">Egresos:</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(item.egresos, currencyCode)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-4">
          <span className="text-blue-600 dark:text-blue-400">Saldo:</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(item.saldo, currencyCode)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-4 pt-1 border-t border-gray-200 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Acumulado:</span>
          <span className="font-bold text-gray-900 dark:text-white">
            {formatCurrency(item.acumulado, currencyCode)}
          </span>
        </p>
      </div>
    );
  };

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Flujo de Caja Proyectado (6 meses)
          </CardTitle>
          <div className="flex items-center gap-3">
            {/* Toggle tabla/grafico */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setView('grafico')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  view === 'grafico'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Gráfico
              </button>
              <button
                onClick={() => setView('tabla')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  view === 'tabla'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Tabla
              </button>
            </div>
            {/* Leyenda */}
            <div className="hidden sm:flex gap-3 text-xs">
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
        </div>
      </CardHeader>
      <CardContent>
        {view === 'grafico' ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrency(v, currencyCode).replace(/\.\d+$/, '').replace(/\s/g, '')}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
              {/* Saldo como área suavizada (línea principal) */}
              <Area
                type="monotone"
                dataKey="saldo"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#colorSaldo)"
                name="Saldo"
                dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
              />
              {/* Ingresos como línea punteada */}
              <Line
                type="monotone"
                dataKey="ingresos"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#22c55e' }}
                name="Ingresos"
              />
              {/* Egresos como línea punteada */}
              <Line
                type="monotone"
                dataKey="egresos"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: '#ef4444' }}
                name="Egresos"
              />
              {/* Saldo acumulado como línea sólida */}
              <Line
                type="monotone"
                dataKey="acumulado"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#8b5cf6' }}
                name="Acumulado"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
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
                {chartData.map((item, index) => {
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
                        item.acumulado >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {formatCurrency(item.acumulado, currencyCode)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {tendencia === 'up' && <TrendingUp className="h-4 w-4 text-green-500 mx-auto" />}
                        {tendencia === 'down' && <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />}
                        {tendencia === 'neutral' && <Minus className="h-4 w-4 text-gray-400 mx-auto" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FlujoProyectadoChart;
