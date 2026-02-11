'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, LayoutGrid, Users, AlertTriangle } from 'lucide-react';
import type { EventosPorDia, EventosPorModulo, UsuarioActivo, ErrorIntegracion } from './auditoriaReportService';

// ─── Eventos por Día ─────────────────────────────────────────────────────────

interface EventosPorDiaChartProps {
  data: EventosPorDia[];
  isLoading: boolean;
}

export function EventosPorDiaChart({ data, isLoading }: EventosPorDiaChartProps) {
  const chartData = useMemo(() => data.map((d) => ({
    ...d,
    fechaCorta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
  })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Actividad por Día</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay actividad en este período</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="fechaCorta" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { creates: 'Creaciones', updates: 'Actualizaciones', deletes: 'Eliminaciones' };
                return [value, labels[name] || name];
              }}
            />
            <Legend formatter={(v) => {
              const labels: Record<string, string> = { creates: 'Creaciones', updates: 'Actualizaciones', deletes: 'Eliminaciones' };
              return <span className="text-xs text-gray-600 dark:text-gray-400">{labels[v] || v}</span>;
            }} />
            <Bar dataKey="creates" stackId="a" fill="#10B981" />
            <Bar dataKey="updates" stackId="a" fill="#F59E0B" />
            <Bar dataKey="deletes" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Eventos por Módulo ──────────────────────────────────────────────────────

interface EventosPorModuloChartProps {
  data: EventosPorModulo[];
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

export function EventosPorModuloChart({ data, isLoading }: EventosPorModuloChartProps) {
  const chartData = useMemo(() => data.map((d) => ({ name: d.module, value: d.count })), [data]);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <LayoutGrid className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Eventos por Módulo</h3>
      </div>
      {chartData.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay datos</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={renderLabel} outerRadius={110} dataKey="value">
              {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
            <Legend formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Usuarios Más Activos ────────────────────────────────────────────────────

interface UsuariosActivosListProps {
  data: UsuarioActivo[];
  isLoading: boolean;
}

export function UsuariosActivosList({ data, isLoading }: UsuariosActivosListProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
          <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Usuarios Más Activos</h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay actividad de usuarios</div>
      ) : (
        <div className="space-y-3">
          {data.map((u, idx) => {
            const maxActions = data[0]?.total_actions || 1;
            const pct = (u.total_actions / maxActions) * 100;
            return (
              <div key={u.user_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] flex items-center justify-center font-semibold">{idx + 1}</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate text-xs">{u.user_name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
                    <span className="text-green-600 dark:text-green-400">{u.creates}C</span>
                    <span className="text-amber-600 dark:text-amber-400">{u.updates}U</span>
                    <span className="text-red-600 dark:text-red-400">{u.deletes}D</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-xs ml-1">{u.total_actions}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-indigo-500 dark:bg-indigo-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Errores de Integración ──────────────────────────────────────────────────

interface ErroresIntegracionListProps {
  data: ErrorIntegracion[];
  isLoading: boolean;
}

export function ErroresIntegracionList({ data, isLoading }: ErroresIntegracionListProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Errores de Integración</h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay errores de integración</div>
      ) : (
        <div className="space-y-3">
          {data.map((e, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-red-700 dark:text-red-400">{e.source}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">{e.event_type}</span>
                </div>
                <span className="text-xs font-bold text-red-700 dark:text-red-300">{e.count}x</span>
              </div>
              {e.last_error && (
                <p className="text-[10px] text-red-500 dark:text-red-400 truncate">{e.last_error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
