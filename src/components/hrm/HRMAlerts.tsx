'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronRight,
  Bell,
} from 'lucide-react';
import Link from 'next/link';

export interface HRMAlert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  title: string;
  description: string;
  count: number;
  link: string;
}

interface HRMAlertsProps {
  alerts: HRMAlert[];
  isLoading?: boolean;
}

const alertStyles = {
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    badgeVariant: 'outline' as const,
  },
  danger: {
    icon: AlertCircle,
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    iconColor: 'text-red-600 dark:text-red-400',
    badgeVariant: 'destructive' as const,
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    iconColor: 'text-blue-600 dark:text-blue-400',
    badgeVariant: 'secondary' as const,
  },
};

export function HRMAlerts({ alerts, isLoading }: HRMAlertsProps) {
  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse h-12 sm:h-16 bg-gray-100 dark:bg-gray-700 rounded-lg"
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2 sm:mb-3">
              <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay alertas pendientes
            </p>
            <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">
              Todo está en orden
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-gray-900 dark:text-white">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          Alertas
          <Badge variant="secondary" className="ml-2 text-[10px] sm:text-xs">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-6 pt-0">
        {alerts.map((alert) => {
          const style = alertStyles[alert.type];
          const Icon = style.icon;

          return (
            <Link
              key={alert.id}
              href={alert.link}
              className={cn(
                'flex items-center justify-between p-2 sm:p-3 rounded-lg border transition-colors hover:opacity-90',
                style.bgColor,
                style.borderColor
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5 shrink-0', style.iconColor)} />
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-xs sm:text-sm truncate">
                    {alert.title}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                    {alert.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-2">
                <Badge variant={style.badgeVariant} className="text-[10px] sm:text-xs">{alert.count}</Badge>
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default HRMAlerts;
