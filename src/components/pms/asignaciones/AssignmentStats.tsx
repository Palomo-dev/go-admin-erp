'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Calendar, CalendarClock, CalendarDays } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface AssignmentStatsProps {
  totalUnassigned: number;
  arrivingToday: number;
  arrivingTomorrow: number;
  arrivingThisWeek: number;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  urgent?: boolean;
}

function StatCard({ title, value, icon, color, urgent = false }: StatCardProps) {
  return (
    <Card className={cn(
      'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
      urgent && value > 0 && 'border-red-300 dark:border-red-700'
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className={cn(
              'text-2xl font-bold mt-1',
              urgent && value > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
            )}>
              {value}
            </p>
          </div>
          <div className={cn('p-3 rounded-full', color)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AssignmentStats({
  totalUnassigned,
  arrivingToday,
  arrivingTomorrow,
  arrivingThisWeek,
  isLoading = false,
}: AssignmentStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        title="Sin Asignar"
        value={totalUnassigned}
        icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
        color="bg-orange-100 dark:bg-orange-900/30"
      />
      <StatCard
        title="Llegan Hoy"
        value={arrivingToday}
        icon={<Calendar className="h-5 w-5 text-red-600" />}
        color="bg-red-100 dark:bg-red-900/30"
        urgent
      />
      <StatCard
        title="Llegan Mañana"
        value={arrivingTomorrow}
        icon={<CalendarClock className="h-5 w-5 text-yellow-600" />}
        color="bg-yellow-100 dark:bg-yellow-900/30"
      />
      <StatCard
        title="Esta Semana"
        value={arrivingThisWeek}
        icon={<CalendarDays className="h-5 w-5 text-blue-600" />}
        color="bg-blue-100 dark:bg-blue-900/30"
      />
    </div>
  );
}
