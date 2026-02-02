'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  DollarSign,
  Car,
  TrendingUp
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface SessionStatsProps {
  totalSessions: number;
  activeSessions: number;
  closedSessions: number;
  cancelledSessions: number;
  totalRevenue: number;
  avgDuration: number;
}

export function SessionStats({
  totalSessions,
  activeSessions,
  closedSessions,
  cancelledSessions,
  totalRevenue,
  avgDuration,
}: SessionStatsProps) {
  const stats = [
    {
      label: 'Total Sesiones',
      value: totalSessions,
      icon: <Car className="h-5 w-5" />,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Activas',
      value: activeSessions,
      icon: <Clock className="h-5 w-5" />,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      label: 'Cerradas',
      value: closedSessions,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Canceladas',
      value: cancelledSessions,
      icon: <XCircle className="h-5 w-5" />,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
    {
      label: 'Ingresos',
      value: formatCurrency(totalRevenue),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      isText: true,
    },
    {
      label: 'Duración Prom.',
      value: `${Math.round(avgDuration)} min`,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat, index) => (
        <Card key={index} className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <span className={stat.color}>{stat.icon}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {stat.label}
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
