'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { CreditCard, CheckCircle, XCircle, PauseCircle, AlertTriangle } from 'lucide-react';

interface PassesStatsProps {
  stats: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    expiringSoon: number;
  };
  isLoading?: boolean;
}

export function PassesStats({ stats, isLoading }: PassesStatsProps) {
  const statItems = [
    {
      label: 'Total Pases',
      value: stats.total,
      icon: CreditCard,
      color: 'blue',
    },
    {
      label: 'Activos',
      value: stats.active,
      icon: CheckCircle,
      color: 'green',
    },
    {
      label: 'Vencidos',
      value: stats.expired,
      icon: XCircle,
      color: 'red',
    },
    {
      label: 'Suspendidos',
      value: stats.suspended,
      icon: PauseCircle,
      color: 'orange',
    },
    {
      label: 'Por Vencer (7d)',
      value: stats.expiringSoon,
      icon: AlertTriangle,
      color: 'yellow',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; icon: string; text: string }> = {
      blue: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        icon: 'text-blue-600 dark:text-blue-400',
        text: 'text-blue-600 dark:text-blue-400',
      },
      green: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        icon: 'text-green-600 dark:text-green-400',
        text: 'text-green-600 dark:text-green-400',
      },
      red: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        icon: 'text-red-600 dark:text-red-400',
        text: 'text-red-600 dark:text-red-400',
      },
      orange: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        icon: 'text-orange-600 dark:text-orange-400',
        text: 'text-orange-600 dark:text-orange-400',
      },
      yellow: {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        icon: 'text-yellow-600 dark:text-yellow-400',
        text: 'text-yellow-600 dark:text-yellow-400',
      },
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {statItems.map((item) => {
        const colors = getColorClasses(item.color);
        const Icon = item.icon;

        return (
          <Card
            key={item.label}
            className="p-4 dark:bg-gray-800 dark:border-gray-700"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${colors.bg}`}>
                <Icon className={`h-5 w-5 ${colors.icon}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
                <p className={`text-xl font-bold ${colors.text}`}>
                  {isLoading ? '...' : item.value}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default PassesStats;
