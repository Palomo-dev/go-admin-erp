'use client';

import { Card } from '@/components/ui/card';
import { Clock, CheckCircle, Users, XCircle, AlertTriangle, CalendarCheck } from 'lucide-react';
import type { ReservationStats } from './reservasMesasService';

interface ReservasStatsProps {
  stats: ReservationStats | null;
  isLoading: boolean;
}

export function ReservasStats({ stats, isLoading }: ReservasStatsProps) {
  const items = [
    {
      label: 'Hoy',
      value: stats?.total ?? 0,
      icon: CalendarCheck,
      color: 'blue',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Pendientes',
      value: stats?.pending ?? 0,
      icon: Clock,
      color: 'amber',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Confirmadas',
      value: stats?.confirmed ?? 0,
      icon: CheckCircle,
      color: 'green',
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Sentadas',
      value: stats?.seated ?? 0,
      icon: Users,
      color: 'indigo',
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      text: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      label: 'Canceladas',
      value: stats?.cancelled ?? 0,
      icon: XCircle,
      color: 'red',
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'No Show',
      value: stats?.no_show ?? 0,
      icon: AlertTriangle,
      color: 'orange',
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-600 dark:text-orange-400',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {items.map((_, i) => (
          <Card key={i} className="animate-pulse bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <div className="p-4 h-20" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.label}
            className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          >
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.bg}`}>
                  <Icon className={`h-5 w-5 ${item.text}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {item.value}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
