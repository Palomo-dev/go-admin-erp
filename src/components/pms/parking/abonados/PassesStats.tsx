'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { StatsSkeleton } from '@/components/common/PageSkeletons';
import { CreditCard, CheckCircle, XCircle, PauseCircle, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('pmsParking');
  const statItems = [
    {
      label: t('passesStats.total'),
      value: stats.total,
      icon: CreditCard,
      color: 'blue',
    },
    {
      label: t('passesStats.activos'),
      value: stats.active,
      icon: CheckCircle,
      color: 'green',
    },
    {
      label: t('passesStats.vencidos'),
      value: stats.expired,
      icon: XCircle,
      color: 'red',
    },
    {
      label: t('passesStats.suspendidos'),
      value: stats.suspended,
      icon: PauseCircle,
      color: 'orange',
    },
    {
      label: t('passesStats.porVencer'),
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

  if (isLoading) {
    return <StatsSkeleton count={5} />;
  }

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
            <div className="flex flex-wrap items-center gap-3">
              <div className={`p-2 rounded-lg ${colors.bg}`}>
                <Icon className={`h-5 w-5 ${colors.icon}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
                <p className={`text-xl font-bold ${colors.text}`}>
                  {item.value}
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
