'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info,
  ChevronRight,
  Bell
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/utils/Utils';

interface Alert {
  id: string;
  type: 'unassigned' | 'block' | 'payment' | 'noshow';
  title: string;
  description: string;
  severity: 'warning' | 'error' | 'info';
  link?: string;
  createdAt: string;
}

interface AlertsPanelProps {
  alerts: Alert[];
  isLoading?: boolean;
}

const severityConfig = {
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
  },
  info: {
    icon: Info,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
};

function AlertItem({ alert }: { alert: Alert }) {
  const router = useRouter();
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        config.bgColor,
        config.borderColor,
        alert.link && 'cursor-pointer hover:opacity-80'
      )}
      onClick={() => alert.link && router.push(alert.link)}
    >
      <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', config.color)}>{alert.title}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          {alert.description}
        </p>
      </div>
      {alert.link && (
        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
      )}
    </div>
  );
}

function AlertSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

export function AlertsPanel({ alerts, isLoading = false }: AlertsPanelProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Bell className="h-5 w-5 text-blue-600" />
          Alertas
          {alerts.length > 0 && (
            <Badge variant="secondary" className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <AlertSkeleton />
            <AlertSkeleton />
            <AlertSkeleton />
          </>
        ) : alerts.length === 0 ? (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
              <Info className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay alertas pendientes
            </p>
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
