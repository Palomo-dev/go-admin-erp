'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, Car, CreditCard, Clock, RotateCcw } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface PagosStatsProps {
  stats: {
    total_payments: number;
    total_amount: number;
    sessions_paid: number;
    passes_paid: number;
    pending_amount: number;
    reversed_amount: number;
  };
  isLoading?: boolean;
}

export function PagosStats({ stats, isLoading }: PagosStatsProps) {
  const statItems = [
    {
      label: 'Total Recaudado',
      value: formatCurrency(stats.total_amount),
      icon: DollarSign,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Pagos Sesiones',
      value: stats.sessions_paid,
      icon: Car,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Pagos Abonados',
      value: stats.passes_paid,
      icon: CreditCard,
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Pendiente',
      value: formatCurrency(stats.pending_amount),
      icon: Clock,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Reversados',
      value: formatCurrency(stats.reversed_amount),
      icon: RotateCcw,
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-600 dark:text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {statItems.map((item, index) => (
        <Card
          key={index}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <CardContent className="p-4">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.bgColor}`}>
                  <item.icon className={`h-5 w-5 ${item.textColor}`} />
                </div>
                <div>
                  <p className={`text-lg font-bold ${item.textColor}`}>{item.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default PagosStats;
