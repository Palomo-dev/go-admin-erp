'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Activity, 
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { MovementStats as MovementStatsType } from '@/lib/services/stockService';

interface MovimientosStatsProps {
  stats: MovementStatsType;
  isLoading?: boolean;
}

export function MovimientosStats({ stats, isLoading }: MovimientosStatsProps) {
  const statCards = [
    {
      title: 'Total Movimientos',
      value: stats.totalMovements.toLocaleString(),
      icon: Activity,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Total Entradas',
      value: stats.totalIn.toLocaleString(),
      icon: ArrowDownCircle,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400'
    },
    {
      title: 'Total Salidas',
      value: stats.totalOut.toLocaleString(),
      icon: ArrowUpCircle,
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-600 dark:text-red-400'
    },
    {
      title: 'Valor Entradas',
      value: formatCurrency(stats.valueIn),
      icon: TrendingUp,
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      title: 'Valor Salidas',
      value: formatCurrency(stats.valueOut),
      icon: TrendingDown,
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      textColor: 'text-orange-600 dark:text-orange-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {statCards.map((stat, index) => (
        <Card 
          key={index} 
          className="border-gray-200 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.textColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {stat.title}
                </p>
                <p className={`text-lg font-semibold ${stat.textColor} truncate`}>
                  {isLoading ? '...' : stat.value}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default MovimientosStats;
