'use client';

import { Card } from '@/components/ui/card';
import { Clock, UserCheck, Bus, CheckCircle, XCircle, Users } from 'lucide-react';

interface TripsStatsProps {
  stats: {
    total: number;
    scheduled: number;
    boarding: number;
    in_transit: number;
    completed: number;
    cancelled: number;
    occupancy: number;
  };
}

export function TripsStats({ stats }: TripsStatsProps) {
  const statCards = [
    {
      title: 'Programados',
      value: stats.scheduled,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'En Abordaje',
      value: stats.boarding,
      icon: <UserCheck className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      title: 'En Ruta',
      value: stats.in_transit,
      icon: <Bus className="h-5 w-5" />,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Completados',
      value: stats.completed,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-gray-600 bg-gray-100 dark:bg-gray-800',
    },
    {
      title: 'Cancelados',
      value: stats.cancelled,
      icon: <XCircle className="h-5 w-5" />,
      color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    },
    {
      title: 'Ocupación Prom.',
      value: `${stats.occupancy}%`,
      icon: <Users className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.title} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {stat.title}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
