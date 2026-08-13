'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Clock,
  Send,
  AlertTriangle,
  CheckCircle2,
  MailOpen,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { NotificacionesKPIs as KPIsType } from '@/lib/services/notificacionesDashboardService';

interface NotificacionesKPIsProps {
  data: KPIsType | null;
  isLoading?: boolean;
}

type ColorKey = 'yellow' | 'blue' | 'red' | 'green' | 'purple';

const colorClasses: Record<ColorKey, {
  bg: string;
  icon: string;
  border: string;
}> = {
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
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
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
};

interface KPICardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: ColorKey;
  subtitle?: string;
  isLoading?: boolean;
}

function KPICard({ title, value, icon, color, subtitle, isLoading }: KPICardProps) {
  const colors = colorClasses[color];

  if (isLoading) {
    return (
      <Card className={cn('border', colors.border, 'dark:bg-gray-800/50')}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className={cn('p-3 rounded-lg', colors.bg)}>
              <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border transition-all hover:shadow-md', colors.border, 'dark:bg-gray-800/50')}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            )}
          </div>
          <div className={cn('p-3 rounded-lg', colors.bg)}>
            <div className={cn('h-6 w-6', colors.icon)}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NotificacionesKPIs({ data, isLoading }: NotificacionesKPIsProps) {
  const kpis = [
    {
      title: 'Pendientes',
      value: data?.pendientes ?? 0,
      icon: <Clock className="h-6 w-6" />,
      color: 'yellow' as const,
      subtitle: 'En cola',
    },
    {
      title: 'Enviadas Hoy',
      value: data?.enviadasHoy ?? 0,
      icon: <Send className="h-6 w-6" />,
      color: 'blue' as const,
      subtitle: 'Últimas 24h',
    },
    {
      title: 'Fallidas',
      value: data?.fallidas ?? 0,
      icon: <AlertTriangle className="h-6 w-6" />,
      color: 'red' as const,
      subtitle: 'Requieren atención',
    },
    {
      title: 'Entregadas',
      value: data?.entregadas ?? 0,
      icon: <CheckCircle2 className="h-6 w-6" />,
      color: 'green' as const,
      subtitle: 'Total histórico',
    },
    {
      title: 'Leídas',
      value: data?.leidas ?? 0,
      icon: <MailOpen className="h-6 w-6" />,
      color: 'purple' as const,
      subtitle: 'Total histórico',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {kpis.map((kpi) => (
        <KPICard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          icon={kpi.icon}
          color={kpi.color}
          subtitle={kpi.subtitle}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}

export default NotificacionesKPIs;
