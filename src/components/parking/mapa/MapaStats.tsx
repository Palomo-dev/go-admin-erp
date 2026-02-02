'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Car, CircleCheck, Clock, Wrench, Percent } from 'lucide-react';
import type { MapStats } from '@/lib/services/parkingMapService';

interface MapaStatsProps {
  stats: MapStats;
  isLoading?: boolean;
}

export function MapaStats({ stats, isLoading }: MapaStatsProps) {
  const items = [
    {
      label: 'Total Espacios',
      value: stats.total,
      icon: Car,
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      textColor: 'text-gray-600 dark:text-gray-300',
    },
    {
      label: 'Libres',
      value: stats.free,
      icon: CircleCheck,
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Ocupados',
      value: stats.occupied,
      icon: Car,
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'Reservados',
      value: stats.reserved,
      icon: Clock,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Mantenimiento',
      value: stats.maintenance,
      icon: Wrench,
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Ocupación',
      value: `${stats.occupancy_rate}%`,
      icon: Percent,
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {items.map((item, index) => (
        <Card
          key={index}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <CardContent className="p-3">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${item.bgColor}`}>
                  <item.icon className={`h-4 w-4 ${item.textColor}`} />
                </div>
                <div>
                  <p className={`text-lg font-bold ${item.textColor}`}>{item.value}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{item.label}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default MapaStats;
