'use client';

import { Card, CardContent } from '@/components/ui/card';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  DollarSign,
  TrendingUp,
  Package,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Pedidos hoy',
  yesterday: 'Pedidos ayer',
  last7: 'Pedidos (7 días)',
  last30: 'Pedidos (30 días)',
  custom: 'Total pedidos',
};

const COMPARISON_LABELS: Record<DatePreset, string> = {
  today: 'vs ayer (misma hora)',
  yesterday: 'vs antier',
  last7: 'vs 7 días previos',
  last30: 'vs 30 días previos',
  custom: 'vs período previo',
};

interface WebOrderStatsData {
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  avg_order_value: number;
}

interface WebOrderStatsProps {
  stats: WebOrderStatsData;
  previousStats?: WebOrderStatsData;
  isLoading?: boolean;
  datePreset?: DatePreset;
}

// Indicador de variación porcentual respecto al período anterior
function TrendBadge({ current, previous, invert, label }: {
  current: number;
  previous: number;
  invert?: boolean;
  label: string;
}) {
  // Sin datos del período anterior: no mostramos comparación
  if (previous === 0 && current === 0) return null;
  const delta = current - previous;
  const pct = previous > 0 ? (delta / previous) * 100 : (current > 0 ? 100 : 0);
  const isUp = delta > 0;
  const isFlat = delta === 0;
  // Por defecto subir = bueno (verde); en métricas "malas" (cancelados) se invierte
  const isGood = invert ? delta < 0 : delta > 0;
  const colorClass = isFlat
    ? 'text-gray-400 dark:text-gray-500'
    : isGood
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';
  return (
    <div className={`flex items-center gap-0.5 text-xs font-medium ${colorClass}`} title={label}>
      {isFlat ? (
        <span>—</span>
      ) : isUp ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      <span className="tabular-nums">{Math.abs(Math.round(pct))}%</span>
    </div>
  );
}

export function WebOrderStats({ stats, previousStats, isLoading, datePreset = 'today' }: WebOrderStatsProps) {
  const comparisonLabel = COMPARISON_LABELS[datePreset] || 'vs período previo';
  const statItems = [
    {
      label: DATE_PRESET_LABELS[datePreset] || 'Pedidos',
      value: stats.total_orders,
      current: stats.total_orders,
      previous: previousStats?.total_orders,
      icon: <Package className="h-5 w-5" />,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Pendientes',
      value: stats.pending_orders,
      current: stats.pending_orders,
      previous: previousStats?.pending_orders,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
      highlight: stats.pending_orders > 0,
    },
    {
      label: 'Completados',
      value: stats.completed_orders,
      current: stats.completed_orders,
      previous: previousStats?.completed_orders,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Cancelados',
      value: stats.cancelled_orders,
      current: stats.cancelled_orders,
      previous: previousStats?.cancelled_orders,
      invert: true,
      icon: <XCircle className="h-5 w-5" />,
      color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    },
    {
      label: 'Ingresos',
      value: `$${stats.total_revenue.toLocaleString()}`,
      current: stats.total_revenue,
      previous: previousStats?.total_revenue,
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      label: 'Ticket promedio',
      value: `$${Math.round(stats.avg_order_value).toLocaleString()}`,
      current: stats.avg_order_value,
      previous: previousStats?.avg_order_value,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-3 sm:p-4">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-muted dark:bg-gray-700 rounded-lg mb-2" />
              <div className="h-4 w-16 bg-muted dark:bg-gray-700 rounded mb-1" />
              <div className="h-6 w-12 bg-muted dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
      {statItems.map((item, index) => (
        <Card 
          key={index} 
          className={`transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${item.highlight ? 'ring-2 ring-yellow-500 shadow-lg' : ''}`}
        >
          <CardContent className="p-3 sm:p-4">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-2 ${item.color}`}>
              {item.icon}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 truncate">{item.label}</p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <p className="text-lg sm:text-2xl font-bold dark:text-gray-100 tabular-nums">{item.value}</p>
              {previousStats && (
                <TrendBadge
                  current={item.current}
                  previous={item.previous ?? 0}
                  invert={item.invert}
                  label={comparisonLabel}
                />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
