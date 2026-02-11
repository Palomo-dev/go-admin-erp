'use client';

import { DollarSign, TrendingUp, Receipt, ShoppingCart, Hotel, Package, CreditCard, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/utils/Utils';
import type { KPIData } from './reportesService';

interface ReportesKPIsProps {
  data: KPIData | null;
  isLoading: boolean;
}

const kpiConfig = [
  {
    key: 'ventasHoy' as const,
    label: 'Ventas Hoy',
    icon: DollarSign,
    color: 'blue',
    isCurrency: true,
  },
  {
    key: 'ventasMes' as const,
    label: 'Ventas Período',
    icon: TrendingUp,
    color: 'green',
    isCurrency: true,
  },
  {
    key: 'ingresosNetosMes' as const,
    label: 'Ingresos Netos',
    icon: CreditCard,
    color: 'emerald',
    isCurrency: true,
  },
  {
    key: 'ticketPromedio' as const,
    label: 'Ticket Promedio',
    icon: ShoppingCart,
    color: 'purple',
    isCurrency: true,
  },
  {
    key: 'totalFacturas' as const,
    label: 'Facturas Período',
    icon: Receipt,
    color: 'orange',
    isCurrency: false,
  },
  {
    key: 'reservasActivas' as const,
    label: 'Reservas Activas',
    icon: Hotel,
    color: 'cyan',
    isCurrency: false,
  },
  {
    key: 'productosActivos' as const,
    label: 'Productos Activos',
    icon: Package,
    color: 'indigo',
    isCurrency: false,
  },
  {
    key: 'pagosRecibidosMes' as const,
    label: 'Pagos Recibidos',
    icon: BarChart3,
    color: 'teal',
    isCurrency: true,
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
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
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
};

export function ReportesKPIs({ data, isLoading }: ReportesKPIsProps) {
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

        return (
          <div
            key={kpi.key}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${colors.bg}`}>
                <Icon className={`h-4 w-4 ${colors.icon}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                {kpi.label}
              </span>
            </div>
            <p className={`text-lg font-bold ${colors.text}`}>
              {kpi.isCurrency
                ? formatCurrency(value)
                : value.toLocaleString('es-CO')}
            </p>
          </div>
        );
      })}
    </div>
  );
}
