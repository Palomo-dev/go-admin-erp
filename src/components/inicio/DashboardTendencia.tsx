'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import { inicioService, type PuntoTendencia } from './inicioService';
import { useTranslations } from 'next-intl';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface DashboardTendenciaProps {
  organizationId: number;
  dias?: number;
}

/**
 * Gráfico de tendencia de ventas (línea suavizada estilo Shopify) de los
 * últimos `dias` días. Usa recharts con tooltip interactivo.
 */
export function DashboardTendencia({ organizationId, dias = 30 }: DashboardTendenciaProps) {
  const t = useTranslations('home');
  const [data, setData] = useState<PuntoTendencia[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    inicioService
      .getTendenciaVentas(organizationId, dias)
      .then((pts) => {
        if (!cancelled) setData(pts);
      })
      .catch((err) => {
        console.error('Error cargando tendencia:', err);
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, dias]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const total = data.reduce((s, p) => s + p.total, 0);

  // Formatear fechas para el eje X
  const fmtFecha = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  };

  // Datos transformados para recharts
  const chartData = data.map((p) => ({
    fecha: fmtFecha(p.fecha),
    total: p.total,
    fechaOriginal: p.fecha,
  }));

  // Tooltip personalizado estilo Shopify
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0];
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs">
        <p className="text-gray-500 dark:text-gray-400 mb-1">{item.payload.fecha}</p>
        <p className="font-semibold text-gray-900 dark:text-white">
          {formatCurrency(item.value)}
        </p>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('salesTrend')}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="font-medium text-gray-900 dark:text-white">
            {formatCurrency(total)}
          </span>
          <span>· {dias}d</span>
        </div>
      </div>

      {data.length === 0 || total === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
          <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">{t('noSalesData')}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="fecha"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrency(v).replace(/\.\d+$/, '').replace(/\s/g, '')}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorVentas)"
              dot={false}
              activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
