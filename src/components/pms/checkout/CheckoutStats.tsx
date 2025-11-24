'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LogOut,
  CheckCircle2,
  Clock,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import type { CheckoutStats as CheckoutStatsType } from '@/lib/services/checkoutService';

interface CheckoutStatsProps {
  stats: CheckoutStatsType;
  isLoading?: boolean;
}

export function CheckoutStats({ stats, isLoading }: CheckoutStatsProps) {
  const statsData = [
    {
      title: 'Salidas del Día',
      value: stats.total_departures,
      icon: LogOut,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Check-out Realizados',
      value: stats.checked_out,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      title: 'Pendientes',
      value: stats.pending,
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      title: 'Con Saldo Pendiente',
      value: stats.with_balance,
      icon: DollarSign,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      title: 'Habitaciones Limpias',
      value: stats.rooms_cleaned,
      icon: Sparkles,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
