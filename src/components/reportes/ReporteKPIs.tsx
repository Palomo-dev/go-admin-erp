'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ReporteKPI } from '@/lib/services/reportes/types';

const formatValor = (valor: string | number, formato?: ReporteKPI['formato']): string => {
  if (typeof valor === 'string') return valor;
  if (formato === 'moneda') {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
  }
  if (formato === 'porcentaje') return `${valor}%`;
  return new Intl.NumberFormat('es-CO').format(valor);
};

const toNumber = (valor: string | number): number => {
  if (typeof valor === 'number') return valor;
  const parsed = Number(String(valor).replace(/[^\d.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

interface ReporteKPIsProps {
  kpis: ReporteKPI[];
  comparisonKpis?: ReporteKPI[] | null;
}

export function ReporteKPIs({ kpis, comparisonKpis }: ReporteKPIsProps) {
  const comparisonMap = useMemo(() => {
    if (!comparisonKpis) return null;
    const map = new Map<string, ReporteKPI>();
    comparisonKpis.forEach((k) => map.set(k.titulo, k));
    return map;
  }, [comparisonKpis]);

  const deltas = useMemo(() => {
    if (!comparisonMap) return null;
    return kpis.map((kpi) => {
      const prevKpi = comparisonMap.get(kpi.titulo);
      if (!prevKpi) return null;
      const prev = toNumber(prevKpi.valor);
      const current = toNumber(kpi.valor);
      if (prev === 0) return null;
      const pct = ((current - prev) / Math.abs(prev)) * 100;
      return pct;
    });
  }, [kpis, comparisonMap]);

  if (!kpis.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => {
        const delta = deltas?.[i];
        const isPositive = delta !== null && delta !== undefined && delta > 0;
        const isNegative = delta !== null && delta !== undefined && delta < 0;
        const prevKpi = comparisonMap?.get(kpi.titulo);

        return (
          <div
            key={kpi.titulo}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-3 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.titulo}</p>
            <div className="flex items-end justify-between mt-1 gap-2">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {formatValor(kpi.valor, kpi.formato)}
              </p>
              {delta !== null && delta !== undefined && (
                <span
                  className={
                    'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ' +
                    (isPositive
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : isNegative
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400')
                  }
                >
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
            </div>
            {prevKpi && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                Ant: {formatValor(prevKpi.valor, prevKpi.formato)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
