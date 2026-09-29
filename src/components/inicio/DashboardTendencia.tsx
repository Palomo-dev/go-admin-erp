'use client';

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tarjeta, EmptyState } from '@/components/kit';
import { formatCurrency } from '@/utils/Utils';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
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
 *
 * La tarjeta (`Tarjeta` del kit, Figma 447:73036) se estira (`h-full`) para
 * igualar la altura de su compañera de grid (p. ej. DashboardActividad), y la
 * gráfica crece con `flex-1` para llenar el espacio disponible — sin dejar
 * espacio en blanco.
 */
export function DashboardTendencia({ organizationId, dias = 30 }: DashboardTendenciaProps) {
  const t = useTranslations('home');
  const [data, setData] = useState<PuntoTendencia[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Medición de la altura disponible del contenedor flex para que la gráfica
  // se ajuste dinámicamente y llene el card sin dejar espacio en blanco.
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartHeight, setChartHeight] = useState(200);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const updateHeight = () => setChartHeight(el.clientHeight);
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading]);

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
      <Tarjeta titulo={t('salesTrend')} icono={BarChart3} className="h-full">
        <Skeleton className="h-48 w-full flex-1 rounded-lg" />
      </Tarjeta>
    );
  }

  const total = data.reduce((s, p) => s + p.total, 0);

  // Formatear fechas para el eje X
  const fmtFecha = (iso: string) => {
    return formatPlainDate(iso, { day: '2-digit', month: 'short' });
  };

  // Datos transformados para recharts
  const chartData = data.map((p) => ({
    fecha: fmtFecha(p.fecha),
    total: p.total,
    fechaOriginal: p.fecha,
  }));

  // Tooltip personalizado estilo Shopify
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: { fecha: string } }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0];
    return (
      <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
        <p className="mb-1 text-fg-secondary">{item.payload.fecha}</p>
        <p className="font-semibold text-fg tabular-nums">
          {formatCurrency(item.value)}
        </p>
      </div>
    );
  };

  return (
    <Tarjeta
      titulo={t('salesTrend')}
      icono={BarChart3}
      className="h-full"
      accion={
        <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
          <TrendingUp aria-hidden="true" className="size-3.5 text-success-text" strokeWidth={1.5} />
          <span className="font-medium text-fg tabular-nums">{formatCurrency(total)}</span>
          <span>· {dias}d</span>
        </span>
      }
    >
      {data.length === 0 || total === 0 ? (
        <div ref={chartContainerRef} className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState compacto icono={BarChart3} titulo={t('noSalesData')} descripcion={t('panel.tendenciaVaciaDesc')} />
        </div>
      ) : (
        <div ref={chartContainerRef} className="flex-1 min-h-0 w-full">
          <ResponsiveContainer width="100%" height={chartHeight}>
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
        </div>
      )}
    </Tarjeta>
  );
}
