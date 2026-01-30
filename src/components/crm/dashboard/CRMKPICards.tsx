'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCurrency } from '@/utils/Utils';
import {
  MessageSquare,
  Clock,
  Target,
  TrendingUp,
  Megaphone,
  UserPlus,
  Users,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { KPIData } from './types';

interface CRMKPICardsProps {
  data: KPIData | null;
  isLoading: boolean;
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color: string;
  isLoading: boolean;
}

function KPICard({ title, value, subtitle, icon, trend, color, isLoading }: KPICardProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                'flex items-center text-xs mt-1',
                trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                <TrendingUp className={cn('h-3 w-3 mr-1', !trend.isPositive && 'rotate-180')} />
                {trend.value}%
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-lg', color)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function CRMKPICards({ data, isLoading }: CRMKPICardsProps) {
  const kpis = [
    {
      title: 'Conversaciones Abiertas',
      value: data?.conversationsOpen || 0,
      subtitle: `${data?.conversationsPending || 0} pendientes`,
      icon: <MessageSquare className="h-6 w-6 text-blue-600" />,
      color: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Tiempo Promedio Respuesta',
      value: formatTime(data?.avgResponseTime || 0),
      subtitle: `SLA: ${(data?.slaCompliance || 0).toFixed(0)}%`,
      icon: <Clock className="h-6 w-6 text-purple-600" />,
      color: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Oportunidades Abiertas',
      value: data?.opportunitiesOpen || 0,
      subtitle: formatCurrency(data?.opportunitiesValue || 0, 'COP'),
      icon: <Target className="h-6 w-6 text-green-600" />,
      color: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Pronóstico del Mes',
      value: formatCurrency(data?.monthForecast || 0, 'COP'),
      subtitle: 'Valor ponderado',
      icon: <TrendingUp className="h-6 w-6 text-orange-600" />,
      color: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      title: 'Campañas Activas',
      value: data?.activeCampaigns || 0,
      icon: <Megaphone className="h-6 w-6 text-pink-600" />,
      color: 'bg-pink-100 dark:bg-pink-900/30',
    },
    {
      title: 'Clientes Nuevos',
      value: data?.newCustomers || 0,
      subtitle: `Total: ${data?.totalCustomers || 0}`,
      icon: <UserPlus className="h-6 w-6 text-cyan-600" />,
      color: 'bg-cyan-100 dark:bg-cyan-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {kpis.map((kpi, index) => (
        <KPICard
          key={index}
          title={kpi.title}
          value={kpi.value}
          subtitle={kpi.subtitle}
          icon={kpi.icon}
          color={kpi.color}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
