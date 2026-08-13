'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import {
  Boxes,
  CheckCircle2,
  XCircle,
  Webhook,
  CalendarClock,
} from 'lucide-react';
import type { IntegracionesKPI } from '@/lib/services/integracionesDashboardService';

interface KPICardsProps {
  data: IntegracionesKPI | null;
  isLoading: boolean;
}

interface KPIItem {
  key: keyof IntegracionesKPI;
  label: string;
  icon: React.ReactNode;
  color: 'purple' | 'green' | 'red' | 'blue' | 'orange';
  subtitle?: string;
}

const colorClasses: Record<KPIItem['color'], { bg: string; icon: string; border: string }> = {
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    icon: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

const kpiItems: KPIItem[] = [
  { key: 'totalIntegraciones', label: 'Integraciones', icon: <Boxes size={22} />, color: 'purple' },
  { key: 'integracionesActivas', label: 'Activas', icon: <CheckCircle2 size={22} />, color: 'green' },
  { key: 'integracionesInactivas', label: 'Inactivas', icon: <XCircle size={22} />, color: 'red' },
  { key: 'webhooksConfigurados', label: 'Webhooks', icon: <Webhook size={22} />, color: 'blue' },
  { key: 'eventosDisponibles', label: 'Eventos', icon: <CalendarClock size={22} />, color: 'orange' },
];

export function KPICards({ data, isLoading }: KPICardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
                <div className="h-11 w-11 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
        No se pudieron cargar las métricas de integraciones
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {kpiItems.map((item) => {
        const colors = colorClasses[item.color];
        return (
          <Card
            key={item.key}
            className={cn('border transition-all hover:shadow-md', colors.border, 'bg-white dark:bg-gray-800')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {item.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {data[item.key].toLocaleString('es-CO')}
                  </p>
                </div>
                <div className={cn('p-2.5 rounded-full', colors.bg)}>
                  <div className={colors.icon}>{item.icon}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default KPICards;
