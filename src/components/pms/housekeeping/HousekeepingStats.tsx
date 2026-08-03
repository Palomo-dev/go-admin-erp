'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { StatsSkeleton } from '@/components/common/PageSkeletons';
import { Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { HousekeepingStats } from '@/lib/services/housekeepingService';

interface HousekeepingStatsProps {
  stats: HousekeepingStats;
  isLoading?: boolean;
}

export function HousekeepingStats({ stats, isLoading }: HousekeepingStatsProps) {
  const statCards = [
    {
      title: 'Pendientes',
      value: stats.pending,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      title: 'En Progreso',
      value: stats.in_progress,
      icon: AlertCircle,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Completadas',
      value: stats.done,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'Canceladas',
      value: stats.cancelled,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
  ];

  if (isLoading) {
    return <StatsSkeleton count={4} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.title}
            className="p-6 hover:shadow-lg transition-shadow duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stat.title}
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {stat.value}
                </p>
              </div>
              <div className={`p-3 rounded-full ${stat.bgColor}`}>
                <Icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
