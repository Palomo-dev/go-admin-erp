'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import {
  CheckCircle2,
  AlertCircle,
  Activity,
  XCircle,
  Webhook,
} from 'lucide-react';
import type { IntegrationStats } from '@/lib/services/integrationsService';

interface StatsCardsProps {
  stats: IntegrationStats | null;
  loading: boolean;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';
  subtitle?: string;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
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
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    icon: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  const colors = colorClasses[color];

  return (
    <Card className={cn(
      'border transition-all hover:shadow-md',
      colors.border,
      'bg-white dark:bg-gray-800'
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value.toLocaleString('es-CO')}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
          <div className={cn('p-3 rounded-full', colors.bg)}>
            <div className={colors.icon}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
                <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No se pudieron cargar las estadísticas
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        title="Conexiones Activas"
        value={stats.activeConnections}
        icon={<CheckCircle2 size={24} />}
        color="green"
        subtitle={`de ${stats.totalConnections} totales`}
      />
      <StatCard
        title="Con Error"
        value={stats.errorConnections}
        icon={<AlertCircle size={24} />}
        color="red"
      />
      <StatCard
        title="Eventos Hoy"
        value={stats.eventsToday}
        icon={<Activity size={24} />}
        color="blue"
        subtitle={`${stats.eventsProcessed} procesados`}
      />
      <StatCard
        title="Jobs Fallidos"
        value={stats.jobsFailed}
        icon={<XCircle size={24} />}
        color="orange"
        subtitle={stats.jobsRunning > 0 ? `${stats.jobsRunning} en ejecución` : undefined}
      />
      <StatCard
        title="Webhooks Recibidos"
        value={stats.webhooksReceived}
        icon={<Webhook size={24} />}
        color="purple"
        subtitle="hoy"
      />
    </div>
  );
}

export default StatsCards;
