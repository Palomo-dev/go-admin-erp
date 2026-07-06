'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Clock, CheckCircle2, XCircle, DollarSign, TrendingUp } from 'lucide-react';
import type { CommissionStats } from '@/lib/services/commissionsService';
import { formatCurrency } from '@/utils/Utils';

interface ComisionesStatsProps {
  stats: CommissionStats;
  isLoading: boolean;
}

export function ComisionesStats({ stats, isLoading }: ComisionesStatsProps) {
  const cards = [
    {
      label: 'Total Comisiones',
      value: stats.total.toString(),
      icon: TrendingUp,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Pendientes (Accrued)',
      value: stats.accrued.toString(),
      subValue: formatCurrency(stats.totalAccruedAmount),
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      label: 'Pagadas',
      value: stats.paid.toString(),
      subValue: formatCurrency(stats.totalPaidAmount),
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Canceladas',
      value: stats.cancelled.toString(),
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((card, i) => (
        <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {isLoading ? '...' : card.value}
            </p>
            {card.subValue && (
              <p className={`text-sm font-medium mt-1 ${card.color}`}>
                {isLoading ? '...' : card.subValue}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
