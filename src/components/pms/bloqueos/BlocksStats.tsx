'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Ban, Wrench, User, Calendar, Clock } from 'lucide-react';
import { BlockStats } from '@/lib/services/reservationBlocksService';

interface BlocksStatsProps {
  stats: BlockStats;
  isLoading?: boolean;
}

export function BlocksStats({ stats, isLoading }: BlocksStatsProps) {
  const statCards = [
    {
      title: 'Activos Hoy',
      value: stats.active_today,
      icon: Clock,
      color: 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-400',
    },
    {
      title: 'Próximos',
      value: stats.upcoming,
      icon: Calendar,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-400',
    },
    {
      title: 'Mantenimiento',
      value: stats.by_type.maintenance,
      icon: Wrench,
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-400',
    },
    {
      title: 'Propietario',
      value: stats.by_type.owner,
      icon: User,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900 dark:text-purple-400',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {stat.title}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
