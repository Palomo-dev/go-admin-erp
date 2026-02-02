'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  DollarSign,
  CheckCircle,
  XCircle,
  Car,
  Bike,
  Truck,
  Clock,
} from 'lucide-react';
import { RateStats } from './types';

interface TarifasStatsProps {
  stats: RateStats;
  isLoading: boolean;
}

export function TarifasStats({ stats, isLoading }: TarifasStatsProps) {
  const statItems = [
    {
      label: 'Total Tarifas',
      value: stats.total,
      icon: DollarSign,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Activas',
      value: stats.active,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Inactivas',
      value: stats.inactive,
      icon: XCircle,
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-100 dark:bg-gray-900/30',
    },
    {
      label: 'Autos',
      value: stats.byVehicleType.car || 0,
      icon: Car,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      label: 'Motos',
      value: stats.byVehicleType.motorcycle || 0,
      icon: Bike,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      label: 'Por Hora',
      value: stats.byUnit.hour || 0,
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statItems.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
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
