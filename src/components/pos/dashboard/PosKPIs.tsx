'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShoppingCart,
  TrendingUp,
  Receipt,
  Wallet,
} from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';
import type { PosKPIs } from '@/lib/services/posDashboardService';

interface PosKPIsProps {
  kpis: PosKPIs | null;
  isLoading: boolean;
}

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
  isLoading: boolean;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

function KpiCard({ title, value, icon, color, isLoading }: KpiCardProps) {
  const colors = colorClasses[color];

  if (isLoading) {
    return (
      <Card className={cn('border', colors.border, 'dark:bg-gray-800/50')}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
            <div className={cn('p-3 rounded-lg', colors.bg)}>
              <Skeleton className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border transition-all hover:shadow-md', colors.border, 'dark:bg-gray-800/50')}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
          <div className={cn('p-3 rounded-lg', colors.bg)}>
            <div className={cn('h-6 w-6', colors.icon)}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PosKPIs({ kpis, isLoading }: PosKPIsProps) {
  const data = kpis ?? {
    totalVentasHoy: 0,
    totalVentasMes: 0,
    numTransaccionesHoy: 0,
    ticketPromedio: 0,
    totalVentasWeb: 0,
  };

  const cards = [
    {
      title: 'Ventas hoy',
      value: formatCurrency(data.totalVentasHoy, 'COP'),
      icon: <ShoppingCart className="h-6 w-6" />,
      color: 'blue' as const,
    },
    {
      title: 'Ventas del mes',
      value: formatCurrency(data.totalVentasMes, 'COP'),
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'green' as const,
    },
    {
      title: 'Transacciones hoy',
      value: String(data.numTransaccionesHoy),
      icon: <Receipt className="h-6 w-6" />,
      color: 'purple' as const,
    },
    {
      title: 'Ticket promedio',
      value: formatCurrency(data.ticketPromedio, 'COP'),
      icon: <Wallet className="h-6 w-6" />,
      color: 'orange' as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <KpiCard
          key={card.title}
          title={card.title}
          value={card.value}
          icon={card.icon}
          color={card.color}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}

export default PosKPIs;
