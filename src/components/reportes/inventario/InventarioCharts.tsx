'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownUp, FolderOpen } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { MovimientoPorDia, StockPorCategoria } from './inventarioReportService';

// ─── Movimientos por Día ─────────────────────────────────────────────────────

interface MovimientosPorDiaChartProps {
  data: MovimientoPorDia[];
  isLoading: boolean;
}

export function MovimientosPorDiaChart({ data, isLoading }: MovimientosPorDiaChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      fechaCorta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
        day: '2-digit', month: 'short',
      }),
    }));
  }, [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <ArrowDownUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Movimientos por Día
        </h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay movimientos en este período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="fechaCorta" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number, name: string) => [value.toLocaleString('es-CO'), name === 'entradas' ? 'Entradas' : 'Salidas']}
            />
            <Legend formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v === 'entradas' ? 'Entradas' : 'Salidas'}</span>} />
            <Bar dataKey="entradas" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="salidas" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Stock por Categoría ─────────────────────────────────────────────────────

interface StockPorCategoriaChartProps {
  data: StockPorCategoria[];
  isLoading: boolean;
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6'];

const RADIAN = Math.PI / 180;
function renderLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function StockPorCategoriaChart({ data, isLoading }: StockPorCategoriaChartProps) {
  const chartData = useMemo(() => data.map((d) => ({
    name: d.category_name, value: d.valor_total, unidades: d.total_unidades,
  })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <FolderOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Valorización por Categoría
        </h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay datos de categorías
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={renderLabel} outerRadius={110} dataKey="value">
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
            />
            <Legend formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
