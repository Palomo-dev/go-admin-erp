'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CalendarX, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { AsistenciaPorDia, AusenciaPorTipo, NominaPorPeriodo } from './hrmReportService';

// ─── Asistencia por Día ──────────────────────────────────────────────────────

interface AsistenciaPorDiaChartProps {
  data: AsistenciaPorDia[];
  isLoading: boolean;
}

export function AsistenciaPorDiaChart({ data, isLoading }: AsistenciaPorDiaChartProps) {
  const chartData = useMemo(() => data.map((d) => ({
    ...d,
    fechaCorta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
  })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Marcaciones por Día</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay marcaciones en este período</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="fechaCorta" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number, name: string) => [value, name === 'clock_in' ? 'Entradas' : 'Salidas']}
            />
            <Legend formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v === 'clock_in' ? 'Entradas' : 'Salidas'}</span>} />
            <Bar dataKey="clock_in" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="clock_out" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Ausencias por Tipo ──────────────────────────────────────────────────────

interface AusenciasPorTipoChartProps {
  data: AusenciaPorTipo[];
  isLoading: boolean;
}

const PIE_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#EC4899', '#06B6D4'];

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

export function AusenciasPorTipoChart({ data, isLoading }: AusenciasPorTipoChartProps) {
  const chartData = useMemo(() => data.map((d) => ({ name: d.leave_type_name, value: d.total_days, count: d.count })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
          <CalendarX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Ausencias por Tipo (días)</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay ausencias registradas</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={renderLabel} outerRadius={110} dataKey="value">
              {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value} días`, name]}
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
            />
            <Legend formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Nómina por Período ──────────────────────────────────────────────────────

interface NominaPorPeriodoChartProps {
  data: NominaPorPeriodo[];
  isLoading: boolean;
}

export function NominaPorPeriodoChart({ data, isLoading }: NominaPorPeriodoChartProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
          <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Costo de Nómina por Período</h3>
      </div>
      {data.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay períodos de nómina</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="period_name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { total_gross: 'Bruto', total_net: 'Neto', total_employer_cost: 'Costo Empleador' };
                return [formatCurrency(value), labels[name] || name];
              }}
            />
            <Legend formatter={(v) => {
              const labels: Record<string, string> = { total_gross: 'Bruto', total_net: 'Neto', total_employer_cost: 'Costo Empleador' };
              return <span className="text-xs text-gray-600 dark:text-gray-400">{labels[v] || v}</span>;
            }} />
            <Bar dataKey="total_gross" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            <Bar dataKey="total_net" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="total_employer_cost" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
