'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import { inicioService, type PuntoTendencia } from './inicioService';
import { useTranslations } from 'next-intl';

interface DashboardTendenciaProps {
  organizationId: number;
  dias?: number;
}

/**
 * Gráfico de tendencia de ventas (barras) de los últimos `dias` días.
 * Reemplaza al antiguo bloque "Accesos Rápidos" que era redundante con
 * DashboardAtajos. Muestra un gráfico de barras simple en CSS puro (sin
 * dependencias externas) para mantener el bundle ligero.
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
  const max = Math.max(...data.map((p) => p.total), 1);

  // Etiquetas: primer día, día medio, último día
  const primerDia = data[0]?.fecha ?? '';
  const ultimoDia = data[data.length - 1]?.fecha ?? '';

  const fmtFecha = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
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
        <>
          <div className="flex items-end gap-px h-48 group">
            {data.map((p) => {
              const altura = Math.max((p.total / max) * 100, 1);
              const isPeak = p.total === max && p.total > 0;
              return (
                <div
                  key={p.fecha}
                  className="flex-1 relative flex items-end h-full group/bar"
                  title={`${fmtFecha(p.fecha)}: ${formatCurrency(p.total)}`}
                >
                  <div
                    className={`w-full rounded-t transition-all duration-200 ${
                      isPeak
                        ? 'bg-blue-600 dark:bg-blue-500'
                        : 'bg-blue-400/70 dark:bg-blue-600/60 group-hover/bar:bg-blue-600 dark:group-hover/bar:bg-blue-500'
                    }`}
                    style={{ height: `${altura}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{fmtFecha(primerDia)}</span>
            <span>{fmtFecha(ultimoDia)}</span>
          </div>
        </>
      )}
    </div>
  );
}
