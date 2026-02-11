'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Hotel, Globe, LayoutGrid } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { OcupacionPorDia, IngresoPorCanal, ReservaPorTipoEspacio } from './pmsReportService';

// ─── Ocupación por Día ───────────────────────────────────────────────────────

interface OcupacionPorDiaChartProps {
  data: OcupacionPorDia[];
  isLoading: boolean;
}

export function OcupacionPorDiaChart({ data, isLoading }: OcupacionPorDiaChartProps) {
  const chartData = useMemo(() => data.map((d) => ({
    ...d,
    fechaCorta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
  })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <Hotel className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Ocupación Diaria (%)</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay datos de ocupación</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorOcupacion" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="fechaCorta" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number, name: string) => {
                if (name === 'pctOcupacion') return [`${value.toFixed(1)}%`, 'Ocupación'];
                return [value, name];
              }}
            />
            <Area type="monotone" dataKey="pctOcupacion" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorOcupacion)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Ingresos por Canal ──────────────────────────────────────────────────────

interface IngresosPorCanalChartProps {
  data: IngresoPorCanal[];
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

export function IngresosPorCanalChart({ data, isLoading }: IngresosPorCanalChartProps) {
  const chartData = useMemo(() => data.map((d) => ({ name: d.channel, value: d.total, count: d.count })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
          <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Ingresos por Canal</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay datos de canales</div>
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

// ─── Reservas por Tipo de Espacio ────────────────────────────────────────────

interface ReservasPorTipoChartProps {
  data: ReservaPorTipoEspacio[];
  isLoading: boolean;
}

const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6'];

export function ReservasPorTipoChart({ data, isLoading }: ReservasPorTipoChartProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <LayoutGrid className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reservas por Tipo de Espacio</h3>
      </div>
      {data.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay datos</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
            <YAxis dataKey="space_type_name" type="category" width={120} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number) => [formatCurrency(value), 'Ingreso']}
            />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
