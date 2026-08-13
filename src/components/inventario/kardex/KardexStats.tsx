'use client';

import React from 'react';
import {
  Card,
  CardContent } from '@/components/ui/card';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  DollarSign
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { KardexStats as KardexStatsType } from '@/lib/services/kardexService';

interface KardexStatsProps {
  stats: KardexStatsType;
  isLoading?: boolean;
}

export function KardexStats({ stats, isLoading }: KardexStatsProps) {
  const statCards = [
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
      title: 'Saldo Actual',
      value: stats.balance.toLocaleString(),
      icon: Scale,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Valor Inventario',
      value: formatCurrency(stats.valueIn - stats.valueOut),
      icon: DollarSign,
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                  {stat.title}
                </p>
                <p className={`text-lg font-semibold ${stat.textColor} break-words whitespace-normal`}>
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

export default KardexStats;
