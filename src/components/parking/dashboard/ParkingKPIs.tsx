'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ParkingCircle,
  Car,
  CheckCircle,
  Clock,
  CreditCard,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { cn, formatCurrency } from '@/utils/Utils';
import type { ParkingDashboardStats } from '@/lib/services/parkingDashboardService';

interface ParkingKPIsProps {
  data: ParkingDashboardStats | null;
  isLoading?: boolean;
  currencyCode?: string;
}

interface KPIItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'cyan' | 'red' | 'green' | 'yellow' | 'purple' | 'orange';
}

const colorClasses: Record<KPIItem['color'], { bg: string; icon: string; border: string }> = {
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    icon: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    icon: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

function SkeletonCard() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse mb-3" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function ParkingKPIs({
  data,
  isLoading = false,
  currencyCode = 'COP',
}: ParkingKPIsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const items: KPIItem[] = [
    {
      label: 'Total espacios',
      value: String(data.totalSpaces),
      icon: <ParkingCircle className="h-5 w-5" />,
      color: 'cyan',
    },
    {
      label: 'Ocupados',
      value: String(data.occupiedSpaces),
      icon: <Car className="h-5 w-5" />,
      color: 'red',
    },
    {
      label: 'Disponibles',
      value: String(data.freeSpaces),
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'green',
    },
    {
      label: 'Sesiones activas',
      value: String(data.activeSessions),
      icon: <Clock className="h-5 w-5" />,
      color: 'yellow',
    },
    {
      label: 'Ingresos hoy',
      value: formatCurrency(data.revenueToday, currencyCode),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'green',
    },
    {
      label: 'Pases activos',
      value: String(data.totalActivePasses),
      icon: <CreditCard className="h-5 w-5" />,
      color: 'purple',
    },
    {
      label: 'Pases por vencer (7d)',
      value: String(data.expiringIn7Days),
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'orange',
    },
    {
      label: 'Ocupación',
      value: `${data.occupancyRate}%`,
      icon: <ParkingCircle className="h-5 w-5" />,
      color: data.occupancyRate >= 90 ? 'red' : data.occupancyRate >= 70 ? 'yellow' : 'green',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const c = colorClasses[item.color];
        return (
          <Card
            key={item.label}
            className={cn('bg-white dark:bg-gray-800 border', c.border)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {item.label}
                </span>
                <span className={cn('p-1.5 rounded-lg', c.bg, c.icon)}>
                  {item.icon}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {item.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
