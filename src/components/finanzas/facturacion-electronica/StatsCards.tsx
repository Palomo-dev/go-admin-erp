'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  FileCheck2, 
  FileX2, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Send,
  Loader2
} from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface JobStats {
  total: number;
  pending: number;
  processing: number;
  accepted: number;
  rejected: number;
  failed: number;
  successRate: number;
}

interface StatsCardsProps {
  stats: JobStats;
  isLoading: boolean;
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total Enviados',
      value: stats.total,
      icon: Send,
      color: 'blue',
      bgLight: 'bg-blue-50',
      bgDark: 'dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Aceptados',
      value: stats.accepted,
      icon: FileCheck2,
      color: 'green',
      bgLight: 'bg-green-50',
      bgDark: 'dark:bg-green-900/20',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      title: 'Rechazados',
      value: stats.rejected,
      icon: FileX2,
      color: 'red',
      bgLight: 'bg-red-50',
      bgDark: 'dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Pendientes',
      value: stats.pending + stats.processing,
      icon: Clock,
      color: 'yellow',
      bgLight: 'bg-yellow-50',
      bgDark: 'dark:bg-yellow-900/20',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      title: 'Fallidos',
      value: stats.failed,
      icon: AlertTriangle,
      color: 'orange',
      bgLight: 'bg-orange-50',
      bgDark: 'dark:bg-orange-900/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      title: 'Tasa de Éxito',
      value: `${stats.successRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'indigo',
      bgLight: 'bg-indigo-50',
      bgDark: 'dark:bg-indigo-900/20',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      isPercentage: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card, index) => (
        <Card 
          key={index}
          className={cn(
            'border-0 shadow-sm transition-all hover:shadow-md',
            card.bgLight,
            card.bgDark
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {card.title}
                </p>
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                ) : (
                  <p className={cn(
                    'text-2xl font-bold',
                    card.color === 'green' && 'text-green-700 dark:text-green-400',
                    card.color === 'red' && 'text-red-700 dark:text-red-400',
                    card.color === 'yellow' && 'text-yellow-700 dark:text-yellow-400',
                    card.color === 'orange' && 'text-orange-700 dark:text-orange-400',
                    card.color === 'blue' && 'text-blue-700 dark:text-blue-400',
                    card.color === 'indigo' && 'text-indigo-700 dark:text-indigo-400',
                  )}>
                    {card.value}
                  </p>
                )}
              </div>
              <div className={cn('p-2 rounded-lg', card.bgLight, card.bgDark)}>
                <card.icon className={cn('h-5 w-5', card.iconColor)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default StatsCards;
