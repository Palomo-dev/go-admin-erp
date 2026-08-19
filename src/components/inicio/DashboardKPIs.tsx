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
  Minus,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import type { DashboardKPIData, PeriodoDashboard } from './inicioService';
import { useTranslations, useLocale } from 'next-intl';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip as RechartsTooltip } from 'recharts';

interface DashboardKPIsProps {
  data: DashboardKPIData | null;
  isLoading: boolean;
  periodo?: PeriodoDashboard;
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
    dynamicLabel: true, // etiqueta cambia según período
  },
  {
    key: 'ventasMes' as const,
    labelKey: 'sales30Days' as const,
    icon: TrendingUp,
    color: 'green',
    isCurrency: true,
    href: '/app/finanzas',
    deltaKey: null,
    dynamicLabel: false,
  },
  {
    key: 'clientesActivos' as const,
    labelKey: 'clients' as const,
    icon: Users,
    color: 'purple',
    isCurrency: false,
    href: '/app/crm',
    deltaKey: null,
    dynamicLabel: false,
  },
  {
    key: 'productosActivos' as const,
    labelKey: 'products' as const,
    icon: Package,
    color: 'orange',
    isCurrency: false,
    href: '/app/inventario/productos',
    deltaKey: null,
    dynamicLabel: false,
  },
  {
    key: 'facturasHoy' as const,
    labelKey: 'invoicesToday' as const,
    icon: Receipt,
    color: 'cyan',
    isCurrency: false,
    href: '/app/finanzas/facturas',
    deltaKey: 'facturasAnterior' as const,
    dynamicLabel: true,
  },
  {
    key: 'empleadosActivos' as const,
    labelKey: 'members' as const,
    icon: UserCheck,
    color: 'indigo',
    isCurrency: false,
    href: '/app/hrm/empleados',
    deltaKey: null,
    dynamicLabel: false,
  },
  {
    key: 'reservasActivas' as const,
    labelKey: 'activeReservations' as const,
    icon: Hotel,
    color: 'teal',
    isCurrency: false,
    href: '/app/pms',
    deltaKey: null,
    dynamicLabel: false,
  },
  {
    key: 'cuentasPorCobrar' as const,
    labelKey: 'receivables' as const,
    icon: CreditCard,
    color: 'red',
    isCurrency: true,
    href: '/app/finanzas/cuentas-por-cobrar',
    deltaKey: null,
    dynamicLabel: false,
  },
];

const colorMap: Record<string, { bg: string; icon: string; text: string; stroke: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-300', stroke: '#3b82f6' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', text: 'text-green-700 dark:text-green-300', stroke: '#22c55e' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', text: 'text-purple-700 dark:text-purple-300', stroke: '#a855f7' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400', text: 'text-orange-700 dark:text-orange-300', stroke: '#f97316' },
  cyan: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', icon: 'text-cyan-600 dark:text-cyan-400', text: 'text-cyan-700 dark:text-cyan-300', stroke: '#06b6d4' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400', text: 'text-indigo-700 dark:text-indigo-300', stroke: '#6366f1' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-900/20', icon: 'text-teal-600 dark:text-teal-400', text: 'text-teal-700 dark:text-teal-300', stroke: '#14b8a6' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', text: 'text-red-700 dark:text-red-300', stroke: '#ef4444' },
};

// Etiqueta dinámica según período
const periodoLabel: Record<PeriodoDashboard, string> = {
  hoy: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  año: 'Año',
};

function generateSparklineData(value: number, deltaPct: number | null, points = 7): number[] {
  if (value === 0 && deltaPct === null) return [0, 0, 0, 0, 0, 0, 0];
  const trend = deltaPct !== null ? deltaPct / 100 : 0;
  const result: number[] = [];
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const base = value * (1 - trend * (1 - progress));
    const variation = Math.sin(i * 1.3 + value * 0.001) * value * 0.05;
    result.push(Math.max(0, base + variation));
  }
  result[points - 1] = value;
  return result;
}

// Tooltip para el mini-sparkline
function SparklineTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200">
      {formatCurrency(payload[0].value)}
    </div>
  );
}

export function DashboardKPIs({ data, isLoading, periodo = 'hoy' }: DashboardKPIsProps) {
  const t = useTranslations('home.kpis');
  const locale = useLocale();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
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

        // Etiqueta dinámica: "Ventas Hoy" → "Ventas 7 días" etc.
        const baseLabel = t(kpi.labelKey);
        const label = kpi.dynamicLabel
          ? baseLabel.replace(/Hoy$/i, periodoLabel[periodo])
          : baseLabel;

        // Cálculo de delta % vs período anterior
        let deltaPct: number | null = null;
        if (kpi.deltaKey && data && data[kpi.deltaKey] !== undefined) {
          const anterior = data[kpi.deltaKey] as number;
          if (anterior > 0) {
            deltaPct = ((value - anterior) / anterior) * 100;
          } else if (value > 0) {
            deltaPct = 100;
          }
        }

        const hasDelta = deltaPct !== null;
        const isPositive = hasDelta && deltaPct! >= 0;

        // Badge estilos: pill con fondo
        const badgeClass = !hasDelta
          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
          : isPositive
            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300';

        // Datos para el mini-sparkline
        const sparkData = generateSparklineData(value, deltaPct).map((v, i) => ({ idx: i, val: v }));

        const content = (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all h-full flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${colors.bg}`}>
                <Icon className={`h-4 w-4 ${colors.icon}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                {label}
              </span>
            </div>
            <p className={`text-lg font-bold ${colors.text}`}>
              {kpi.isCurrency
                ? formatCurrency(value)
                : value.toLocaleString(locale)}
            </p>
            {/* Badge pill */}
            <div className="mt-1.5">
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}`}>
                {hasDelta ? (
                  <>
                    {isPositive ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5" />
                    )}
                    {isPositive ? '+' : ''}{deltaPct!.toFixed(1)}%
                  </>
                ) : (
                  <>
                    <Minus className="h-2.5 w-2.5" />
                    —
                  </>
                )}
              </span>
            </div>
            {/* Mini-sparkline con tooltip */}
            <div className="mt-2 h-8 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <RechartsTooltip content={<SparklineTooltip />} cursor={false} />
                  <Line
                    type="monotone"
                    dataKey="val"
                    stroke={colors.stroke}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
