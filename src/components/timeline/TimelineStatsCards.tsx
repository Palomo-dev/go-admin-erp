'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import {
  Activity,
  Calendar,
  TrendingUp,
  Users,
  FileText,
  Zap,
} from 'lucide-react';
import type { TimelineStats } from '@/lib/services/timelineService';
import { SOURCE_CATEGORY_LABELS } from '@/lib/services/timelineService';

interface TimelineStatsCardsProps {
  stats: TimelineStats | null;
  loading?: boolean;
}

export function TimelineStatsCards({ stats, loading }: TimelineStatsCardsProps) {
  const cards = [
    {
      title: 'Total Eventos',
      value: stats?.totalEvents || 0,
      icon: Activity,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Hoy',
      value: stats?.todayEvents || 0,
      icon: Calendar,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Auditoría',
      value: stats?.byCategory?.audit || 0,
      icon: FileText,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Eventos Sistema',
      value: stats?.byCategory?.domain_event || 0,
      icon: Zap,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card 
          key={index} 
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {card.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {card.value.toLocaleString('es-CO')}
                </p>
              </div>
              <div className={cn('p-3 rounded-lg', card.bgColor)}>
                <card.icon className={cn('h-6 w-6', card.color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
