'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, UserPlus, UserMinus, TrendingUp, TrendingDown } from 'lucide-react';
import { GymReportStats } from '@/lib/services/gymService';

interface StatsCardsProps {
  stats: GymReportStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total Membresías',
      value: stats.totalMemberships,
      icon: Users,
      color: 'blue',
    },
    {
      title: 'Membresías Activas',
      value: stats.activeMemberships,
      icon: UserCheck,
      color: 'green',
    },
    {
      title: 'Renovaciones del Mes',
      value: stats.renewedThisMonth,
      icon: UserPlus,
      color: 'purple',
    },
    {
      title: 'Cancelaciones del Mes',
      value: stats.cancelledThisMonth,
      icon: UserMinus,
      color: 'red',
    },
    {
      title: 'Tasa de Retención',
      value: `${stats.retentionRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'emerald',
    },
    {
      title: 'Tasa de Abandono',
      value: `${stats.churnRate.toFixed(1)}%`,
      icon: TrendingDown,
      color: 'orange',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; icon: string }> = {
      blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400' },
      green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400' },
      purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400' },
      red: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400' },
      emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400' },
      orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400' },
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => {
        const colors = getColorClasses(card.color);
        const Icon = card.icon;
        return (
          <Card key={card.title} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center mb-3`}>
                <Icon className={`h-5 w-5 ${colors.icon}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{card.title}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
