'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, CreditCard, Clock } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { PagoPorDia, PagoPorMetodo, AgingBucket } from './finanzasReportService';

// ─── Pagos por Día ───────────────────────────────────────────────────────────

interface PagosPorDiaChartProps {
  data: PagoPorDia[];
  isLoading: boolean;
}

export function PagosPorDiaChart({ data, isLoading }: PagosPorDiaChartProps) {
  const chartData = useMemo(() => data.map((d) => ({
    ...d,
    fechaCorta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
  })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
          <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Recaudo por Día</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay pagos en este período</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorPagosDia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="fechaCorta" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number) => [formatCurrency(value), 'Recaudo']}
            />
            <Area type="monotone" dataKey="ingresos" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorPagosDia)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Pagos por Método ────────────────────────────────────────────────────────

interface PagosPorMetodoChartProps {
  data: PagoPorMetodo[];
  isLoading: boolean;
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];

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

export function FinanzasPagosPorMetodoChart({ data, isLoading }: PagosPorMetodoChartProps) {
  const chartData = useMemo(() => data.map((d) => ({ name: d.method, value: d.total, count: d.count })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pagos por Método</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay datos de pagos</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={renderLabel} outerRadius={110} dataKey="value">
              {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
            <Legend formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Aging (Cartera) ─────────────────────────────────────────────────────────

interface AgingChartProps {
  data: AgingBucket[];
  isLoading: boolean;
}

export function AgingChart({ data, isLoading }: AgingChartProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  const hasData = data.some((d) => d.ar_total > 0 || d.ap_total > 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Antigüedad de Cartera (Aging)</h3>
      </div>
      {!hasData ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay cuentas pendientes</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'ar_total' ? 'Por Cobrar' : 'Por Pagar']}
            />
            <Legend formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v === 'ar_total' ? 'Por Cobrar' : 'Por Pagar'}</span>} />
            <Bar dataKey="ar_total" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ap_total" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
