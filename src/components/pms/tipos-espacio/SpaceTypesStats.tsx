'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Package, CheckCircle, XCircle, Home, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface SpaceTypesStatsProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    totalSpaces: number;
    avgRate: number;
  };
}

export function SpaceTypesStats({ stats }: SpaceTypesStatsProps) {
  const statCards = [
    {
      title: 'Total Tipos',
      value: stats.total,
      icon: Package,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Activos',
      value: stats.active,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Inactivos',
      value: stats.inactive,
      icon: XCircle,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    },
    {
      title: 'Total Espacios',
      value: stats.totalSpaces,
      icon: Home,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Tarifa Promedio',
      value: formatCurrency(stats.avgRate),
      icon: DollarSign,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {statCards.map((stat, index) => (
        <Card key={index} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {stat.title}
              </p>
              <p className={`text-xl font-bold text-gray-900 dark:text-gray-100 ${stat.isText ? 'text-base' : ''}`}>
                {stat.value}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
