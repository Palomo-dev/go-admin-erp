'use client';

import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Target, Users, Percent } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { OpportunityStats } from './types';

interface OpportunitiesStatsProps {
  stats: OpportunityStats;
  isLoading?: boolean;
}

export function OpportunitiesStats({ stats, isLoading }: OpportunitiesStatsProps) {
  const cards = [
    {
      title: 'Total Oportunidades',
      value: stats.total,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Monto Total',
      value: formatCurrency(stats.totalAmount),
      icon: DollarSign,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Monto Ponderado',
      value: formatCurrency(stats.weightedAmount),
      icon: Target,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Tasa de Cierre',
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Percent,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-3 sm:p-4">
              <div className="animate-pulse">
                <div className="h-3 sm:h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 sm:w-24 mb-2" />
                <div className="h-6 sm:h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 sm:w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      {cards.map((card) => (
        <Card
          key={card.title}
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 truncate">{card.title}</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1 truncate">
                  {card.value}
                </p>
              </div>
              <div className={`p-2 sm:p-3 rounded-full shrink-0 ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 sm:h-6 sm:w-6 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Estadísticas secundarias */}
      <Card className="col-span-2 lg:col-span-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 text-blue-600 dark:text-blue-400">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-lg sm:text-2xl font-bold">{stats.open}</span>
              </div>
              <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400">Abiertas</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 text-green-600 dark:text-green-400">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-lg sm:text-2xl font-bold">{stats.won}</span>
              </div>
              <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400">Ganadas</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 text-red-600 dark:text-red-400">
                <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-lg sm:text-2xl font-bold">{stats.lost}</span>
              </div>
              <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400">Perdidas</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 text-gray-600 dark:text-gray-300">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-sm sm:text-2xl font-bold truncate">{formatCurrency(stats.avgDealSize)}</span>
              </div>
              <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400">Promedio</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
