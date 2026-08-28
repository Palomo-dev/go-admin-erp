'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import type { VentasComprasData } from './FinanzasDashboardService';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface VentasComprasChartProps {
  data: VentasComprasData[];
  isLoading?: boolean;
  currencyCode?: string;
}

/** Umbral de puntos a partir del cual las líneas son más claras que las barras */
const LINE_THRESHOLD = 7;

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

  const totalVentas = data.reduce((sum, d) => sum + d.ventas, 0);
  const totalCompras = data.reduce((sum, d) => sum + d.compras, 0);

  // Detectar granularidad desde el primer punto (el servicio la setea).
  // Si no viene, inferirla del formato de fecha.
  const granularidad: 'dia' | 'mes' = data[0]?.granularidad
    ?? (data[0]?.fecha.length === 10 ? 'dia' : 'mes');

  // Formatear label del eje X según granularidad
  const fmtLabel = (fecha: string) => {
    if (granularidad === 'dia') {
      const [y, m, d] = fecha.split('-');
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    }
    const [y, m] = fecha.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('es', { month: 'short', year: '2-digit' });
  };

  const chartData = data.map((d) => ({
    ...d,
    label: fmtLabel(d.fecha),
  }));

  // Chart adaptativo: pocas series temporales → barras agrupadas;
  // muchas → líneas (muestran mejor la tendencia).
  const useLine = chartData.length > LINE_THRESHOLD;

  // Tooltip personalizado
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
        <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">{label}</p>
        {payload.map((entry) => (
          <p key={entry.dataKey} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600 dark:text-gray-400 capitalize">{entry.dataKey}:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatCurrency(entry.value, currencyCode)}
            </span>
          </p>
        ))}
      </div>
    );
  };

  const axisProps = {
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between">
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
        <ResponsiveContainer width="100%" height={220}>
          {useLine ? (
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                {...axisProps}
                angle={granularidad === 'dia' ? -35 : 0}
                textAnchor={granularidad === 'dia' ? 'end' : 'middle'}
                height={granularidad === 'dia' ? 60 : 30}
                minTickGap={granularidad === 'dia' ? 25 : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                {...axisProps}
                tickFormatter={(v) => formatCurrency(v, currencyCode).replace(/\.\d+$/, '').replace(/\s/g, '')}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
              <Line
                type="monotone"
                dataKey="ventas"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={chartData.length > 15 ? false : { r: 3, fill: '#3b82f6' }}
                activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                name="Ventas"
              />
              <Line
                type="monotone"
                dataKey="compras"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={chartData.length > 15 ? false : { r: 3, fill: '#ef4444' }}
                activeDot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
                name="Compras"
              />
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                {...axisProps}
                angle={granularidad === 'dia' ? -35 : 0}
                textAnchor={granularidad === 'dia' ? 'end' : 'middle'}
                height={granularidad === 'dia' ? 60 : 30}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                {...axisProps}
                tickFormatter={(v) => formatCurrency(v, currencyCode).replace(/\.\d+$/, '').replace(/\s/g, '')}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
              <Bar dataKey="ventas" name="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="compras" name="Compras" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          )}
        </ResponsiveContainer>

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
      </CardContent>
    </Card>
  );
}

export default VentasComprasChart;
