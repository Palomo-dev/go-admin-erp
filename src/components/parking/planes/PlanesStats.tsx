'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, CheckCircle, XCircle, Users } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface PlanesStatsProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    totalSubscribers: number;
    avgPrice: number;
  };
  isLoading?: boolean;
}

export function PlanesStats({ stats, isLoading }: PlanesStatsProps) {
  const statItems = [
    {
      label: 'Total Planes',
      value: stats.total,
      icon: CreditCard,
      color: 'blue',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Activos',
      value: stats.active,
      icon: CheckCircle,
      color: 'green',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Inactivos',
      value: stats.inactive,
      icon: XCircle,
      color: 'gray',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      textColor: 'text-gray-600 dark:text-gray-400',
    },
    {
      label: 'Suscriptores',
      value: stats.totalSubscribers,
      icon: Users,
      color: 'purple',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Precio Promedio',
      value: formatCurrency(stats.avgPrice),
      icon: CreditCard,
      color: 'amber',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-600 dark:text-amber-400',
      isPrice: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {statItems.map((item, index) => (
        <Card
          key={index}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <CardContent className="p-4">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.bgColor}`}>
                  <item.icon className={`h-5 w-5 ${item.textColor}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${item.textColor}`}>
                    {item.isPrice ? item.value : item.value}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.label}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default PlanesStats;
