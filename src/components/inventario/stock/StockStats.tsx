'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Package, 
  DollarSign, 
  AlertTriangle, 
  PackageX,
  Building2
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { StockStats as StockStatsType } from '@/lib/services/stockService';

interface StockStatsProps {
  stats: StockStatsType;
  isLoading?: boolean;
}

export function StockStats({ stats, isLoading }: StockStatsProps) {
  const statCards = [
    {
      title: 'Total Productos',
      value: stats.totalProducts.toLocaleString(),
      icon: Package,
      color: 'blue',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Valor Total',
      value: formatCurrency(stats.totalValue),
      icon: DollarSign,
      color: 'green',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400'
    },
    {
      title: 'Bajo Mínimo',
      value: stats.belowMinimum.toLocaleString(),
      icon: AlertTriangle,
      color: 'yellow',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      textColor: 'text-yellow-600 dark:text-yellow-400'
    },
    {
      title: 'Sin Stock',
      value: stats.outOfStock.toLocaleString(),
      icon: PackageX,
      color: 'red',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-600 dark:text-red-400'
    },
    {
      title: 'Sucursales',
      value: stats.totalBranches.toLocaleString(),
      icon: Building2,
      color: 'purple',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-600 dark:text-purple-400'
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

export default StockStats;
