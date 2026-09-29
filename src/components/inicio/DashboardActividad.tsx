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
import { Tarjeta, EmptyState, PaginationCompact } from '@/components/kit';
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

const ITEMS_PER_PAGE = 8;

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
  const [currentPage, setCurrentPage] = useState(0);

  const dataFiltrada = useMemo(() => {
    if (filtro === 'todos') return data;
    return data.filter((item) => item.modulo === filtro);
  }, [data, filtro]);

  // Página en base 0 (la de PaginationCompact es en base 1: se convierte al pasarla).
  // Reset page cuando cambia el filtro
  const totalPages = Math.ceil(dataFiltrada.length / ITEMS_PER_PAGE);
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const paginatedData = dataFiltrada.slice(
    safePage * ITEMS_PER_PAGE,
    (safePage + 1) * ITEMS_PER_PAGE
  );

  const handleFiltroChange = (value: FiltroModulo) => {
    setFiltro(value);
    setCurrentPage(0);
  };

  if (isLoading) {
    return (
      <Tarjeta titulo={t('title')} icono={Clock}>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo={t('title')} icono={Clock}>
      {/* Tabs de filtro por módulo */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
        {FILTROS.map((f) => {
          const isActive = filtro === f.value;
          const count = f.value === 'todos' ? data.length : data.filter((d) => d.modulo === f.value).length;
          if (f.value !== 'todos' && count === 0) return null;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => handleFiltroChange(f.value)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                isActive
                  ? 'bg-brand-action text-fg-on-brand'
                  : 'text-fg-secondary hover:bg-hover hover:text-fg',
              )}
            >
              {t(f.labelKey)}
              {count > 0 && (
                <span
                  className={cn(
                    'rounded px-1 text-[10px] tabular-nums',
                    isActive ? 'bg-brand-action-hover' : 'bg-subtle',
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
        <EmptyState compacto icono={Clock} titulo={t('noActivity')} descripcion={t('noActivityDesc')} />
      ) : (
        <>
          <div className="space-y-2">
            {paginatedData.map((item) => {
              const config = ICONO_POR_TIPO[item.tipo] || ICONO_POR_TIPO.venta;
              const Icon = config.Icon;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-line bg-subtle p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('p-1.5 rounded-lg flex-shrink-0', config.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', config.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">
                        {item.descripcion}
                      </p>
                      <p className="text-xs text-fg-secondary">
                        {formatRelativeTime(item.fecha, t)}
                      </p>
                    </div>
                  </div>
                  {item.monto !== undefined && (
                    <span className="ml-3 shrink-0 text-sm font-semibold text-success-text tabular-nums">
                      {formatCurrency(item.monto)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Paginación compacta del kit (Figma 447:73137), en base 1 */}
          {totalPages > 1 && (
            <PaginationCompact
              pagina={safePage + 1}
              tamano={ITEMS_PER_PAGE}
              total={dataFiltrada.length}
              onPaginaChange={(p) => setCurrentPage(p - 1)}
              className="mt-4 border-t border-line pt-3"
            />
          )}
        </>
      )}
    </Tarjeta>
  );
}
