'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StatsSkeleton } from '@/components/common/PageSkeletons';
import {
  ParkingSquare,
  CheckCircle,
  Car,
  Wrench,
  Clock,
} from 'lucide-react';
import { SpaceStats } from './types';

interface EspaciosStatsProps {
  stats: SpaceStats;
  isLoading: boolean;
}

export function EspaciosStats({ stats, isLoading }: EspaciosStatsProps) {
  const statItems = [
    {
      label: 'Total Espacios',
      value: stats.total,
      icon: ParkingSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Libres',
      value: stats.free,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Ocupados',
      value: stats.occupied,
      icon: Car,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
    {
      label: 'Reservados',
      value: stats.reserved,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      label: 'Mantenimiento',
      value: stats.maintenance,
      icon: Wrench,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  if (isLoading) {
    return <StatsSkeleton count={5} />;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {statItems.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {item.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
