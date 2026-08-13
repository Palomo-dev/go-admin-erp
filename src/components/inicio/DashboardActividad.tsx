'use client';

import { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Receipt,
  UserPlus,
  Package,
  BedDouble,
  ArrowLeftRight,
  Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import type { ActividadReciente } from './inicioService';
import { useTranslations } from 'next-intl';

interface DashboardActividadProps {
  data: ActividadReciente[];
  isLoading: boolean;
}

type FiltroModulo = 'todos' | 'pos' | 'finance' | 'crm' | 'inventory' | 'pms_hotel';

const FILTROS: { value: FiltroModulo; labelKey: string }[] = [
  { value: 'todos', labelKey: 'filterAll' },
  { value: 'pos', labelKey: 'filterPos' },
  { value: 'finance', labelKey: 'filterFinance' },
  { value: 'crm', labelKey: 'filterCrm' },
  { value: 'inventory', labelKey: 'filterInventory' },
  { value: 'pms_hotel', labelKey: 'filterPms' },
];

const ICONO_POR_TIPO: Record<
  ActividadReciente['tipo'],
  { Icon: React.ComponentType<{ className?: string }>; bg: string; color: string }
> = {
  venta: { Icon: ShoppingCart, bg: 'bg-blue-50 dark:bg-blue-900/20', color: 'text-blue-600 dark:text-blue-400' },
  factura: { Icon: Receipt, bg: 'bg-cyan-50 dark:bg-cyan-900/20', color: 'text-cyan-600 dark:text-cyan-400' },
  cliente: { Icon: UserPlus, bg: 'bg-purple-50 dark:bg-purple-900/20', color: 'text-purple-600 dark:text-purple-400' },
  stock: { Icon: ArrowLeftRight, bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600 dark:text-amber-400' },
  reserva: { Icon: BedDouble, bg: 'bg-indigo-50 dark:bg-indigo-900/20', color: 'text-indigo-600 dark:text-indigo-400' },
  producto: { Icon: Package, bg: 'bg-orange-50 dark:bg-orange-900/20', color: 'text-orange-600 dark:text-orange-400' },
};

function formatRelativeTime(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMin < 1) return t('now');
  if (diffMin < 60) return t('minutesAgo', { min: diffMin });
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return t('hoursAgo', { hours: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t('daysAgo', { days: diffDays });
}

export function DashboardActividad({ data, isLoading }: DashboardActividadProps) {
  const t = useTranslations('home.activity');
  const [filtro, setFiltro] = useState<FiltroModulo>('todos');

  const dataFiltrada = useMemo(() => {
    if (filtro === 'todos') return data;
    return data.filter((item) => item.modulo === filtro);
  }, [data, filtro]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('title')}
        </h3>
      </div>

      {/* Tabs de filtro por módulo */}
      <div className="flex flex-wrap gap-1 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700/50">
        {FILTROS.map((f) => {
          const isActive = filtro === f.value;
          const count = f.value === 'todos' ? data.length : data.filter((d) => d.modulo === f.value).length;
          if (f.value !== 'todos' && count === 0) return null;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
              )}
            >
              {t(f.labelKey)}
              {count > 0 && (
                <span
                  className={cn(
                    'text-[10px] px-1 rounded',
                    isActive ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {dataFiltrada.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
          {t('noActivity')}
        </p>
      ) : (
        <div className="space-y-2">
          {dataFiltrada.map((item) => {
            const config = ICONO_POR_TIPO[item.tipo] || ICONO_POR_TIPO.venta;
            const Icon = config.Icon;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('p-1.5 rounded-lg flex-shrink-0', config.bg)}>
                    <Icon className={cn('h-3.5 w-3.5', config.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.descripcion}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(item.fecha, t)}
                    </p>
                  </div>
                </div>
                {item.monto !== undefined && (
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400 shrink-0 ml-3">
                    {formatCurrency(item.monto)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
