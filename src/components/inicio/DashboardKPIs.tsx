'use client';

import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  Receipt,
  UserCheck,
  Hotel,
  CreditCard,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import type { DashboardKPIData } from './inicioService';
import { useTranslations, useLocale } from 'next-intl';

interface DashboardKPIsProps {
  data: DashboardKPIData | null;
  isLoading: boolean;
}

const kpiConfig = [
  {
    key: 'ventasHoy' as const,
    labelKey: 'salesToday' as const,
    icon: DollarSign,
    color: 'blue',
    isCurrency: true,
    href: '/app/pos',
    deltaKey: 'ventasAnterior' as const,
  },
  {
    key: 'ventasMes' as const,
    labelKey: 'sales30Days' as const,
    icon: TrendingUp,
    color: 'green',
    isCurrency: true,
    href: '/app/finanzas',
    deltaKey: null,
  },
  {
    key: 'clientesActivos' as const,
    labelKey: 'clients' as const,
    icon: Users,
    color: 'purple',
    isCurrency: false,
    href: '/app/crm',
    deltaKey: null,
  },
  {
    key: 'productosActivos' as const,
    labelKey: 'products' as const,
    icon: Package,
    color: 'orange',
    isCurrency: false,
    href: '/app/inventario/productos',
    deltaKey: null,
  },
  {
    key: 'facturasHoy' as const,
    labelKey: 'invoicesToday' as const,
    icon: Receipt,
    color: 'cyan',
    isCurrency: false,
    href: '/app/finanzas/facturas',
    deltaKey: 'facturasAnterior' as const,
  },
  {
    key: 'empleadosActivos' as const,
    labelKey: 'members' as const,
    icon: UserCheck,
    color: 'indigo',
    isCurrency: false,
    href: '/app/hrm/empleados',
    deltaKey: null,
  },
  {
    key: 'reservasActivas' as const,
    labelKey: 'activeReservations' as const,
    icon: Hotel,
    color: 'teal',
    isCurrency: false,
    href: '/app/pms',
    deltaKey: null,
  },
  {
    key: 'cuentasPorCobrar' as const,
    labelKey: 'receivables' as const,
    icon: CreditCard,
    color: 'red',
    isCurrency: true,
    href: '/app/finanzas/cuentas-por-cobrar',
    deltaKey: null,
  },
];

const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: 'text-blue-600 dark:text-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    icon: 'text-green-600 dark:text-green-400',
    text: 'text-green-700 dark:text-green-300',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    icon: 'text-purple-600 dark:text-purple-400',
    text: 'text-purple-700 dark:text-purple-300',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    icon: 'text-orange-600 dark:text-orange-400',
    text: 'text-orange-700 dark:text-orange-300',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    icon: 'text-cyan-600 dark:text-cyan-400',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    icon: 'text-indigo-600 dark:text-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    icon: 'text-teal-600 dark:text-teal-400',
    text: 'text-teal-700 dark:text-teal-300',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: 'text-red-600 dark:text-red-400',
    text: 'text-red-700 dark:text-red-300',
  },
};

export function DashboardKPIs({ data, isLoading }: DashboardKPIsProps) {
  const t = useTranslations('home.kpis');
  const tHome = useTranslations('home');
  const locale = useLocale();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {kpiConfig.map((kpi) => {
        const colors = colorMap[kpi.color] || colorMap.blue;
        const Icon = kpi.icon;
        const value = data ? data[kpi.key] : 0;

        // Cálculo de delta % vs período anterior
        let deltaPct: number | null = null;
        if (kpi.deltaKey && data && data[kpi.deltaKey] !== undefined) {
          const anterior = data[kpi.deltaKey] as number;
          if (anterior > 0) {
            deltaPct = ((value - anterior) / anterior) * 100;
          } else if (value > 0) {
            deltaPct = 100; // subió desde 0
          }
        }

        const isPositive = deltaPct !== null && deltaPct >= 0;
        // Para cuentas por cobrar, "subir" es malo; pero aquí no aplica delta
        const deltaColor = isPositive
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400';

        const content = (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all h-full">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${colors.bg}`}>
                <Icon className={`h-4 w-4 ${colors.icon}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                {t(kpi.labelKey)}
              </span>
            </div>
            <p className={`text-lg font-bold ${colors.text}`}>
              {kpi.isCurrency
                ? formatCurrency(value)
                : value.toLocaleString(locale)}
            </p>
            {deltaPct !== null && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${deltaColor}`}>
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>
                  {isPositive ? '+' : ''}
                  {deltaPct.toFixed(1)}% {tHome('vsPreviousPeriod')}
                </span>
              </div>
            )}
          </div>
        );

        if (kpi.href) {
          return (
            <Link key={kpi.key} href={kpi.href} className="block">
              {content}
            </Link>
          );
        }
        return <div key={kpi.key}>{content}</div>;
      })}
    </div>
  );
}
