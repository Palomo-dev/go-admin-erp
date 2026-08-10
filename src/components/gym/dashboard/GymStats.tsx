'use client';

import React from 'react';
import { Users, AlertTriangle, XCircle, LogIn, DollarSign, TrendingUp } from 'lucide-react';
import { StatsSkeleton } from '@/components/common/PageSkeletons';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { formatCurrency } from '@/utils/Utils';
import { GymStats as GymStatsType } from '@/lib/services/gymService';

interface GymStatsProps {
  stats: GymStatsType;
  isLoading?: boolean;
}

export function GymStats({ stats, isLoading }: GymStatsProps) {
  const statCards = [
    {
      title: 'Membresías Activas',
      value: stats.activeMemberships,
      icon: Users,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Vencen en 7 días',
      value: stats.expiringIn7Days,
      icon: AlertTriangle,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30'
    },
    {
      title: 'Vencidas',
      value: stats.expiredMemberships,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30'
    },
    {
      title: 'Check-ins Hoy',
      value: stats.todayCheckins,
      icon: LogIn,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      title: 'Ingresos Hoy',
      value: formatCurrency(stats.todayRevenue),
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      isMonetary: true
    },
    {
      title: 'Ingresos Semana',
      value: formatCurrency(stats.weekRevenue),
      icon: TrendingUp,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      isMonetary: true
    }
  ];

  if (isLoading) {
    return <StatsSkeleton count={6} />;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className={cn("p-2 rounded-lg w-fit mb-3", stat.bgColor)}>
                <Icon className={cn("h-5 w-5", stat.color)} />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {stat.title}
              </p>
              <p className={cn(
                "text-xl font-bold",
                stat.isMonetary ? "text-gray-900 dark:text-white" : stat.color
              )}>
                {stat.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default GymStats;
