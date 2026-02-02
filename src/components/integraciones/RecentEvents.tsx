'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  Activity,
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { IntegrationEvent } from '@/lib/services/integrationsService';
import Link from 'next/link';

interface RecentEventsProps {
  events: IntegrationEvent[];
  loading: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  received: {
    label: 'Recibido',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <Clock className="h-3 w-3" />,
  },
  processed: {
    label: 'Procesado',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  error: {
    label: 'Error',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle className="h-3 w-3" />,
  },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  return `Hace ${diffDays}d`;
}

export function RecentEvents({ events, loading }: RecentEventsProps) {
  if (loading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
            Eventos Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-2 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
            Eventos Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-3">
              <Activity className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">
              Sin eventos
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Los eventos aparecerán aquí cuando tus integraciones estén activas
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
          Eventos Recientes
        </CardTitle>
        <Link href="/app/integraciones/eventos">
          <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400">
            Ver todos
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {events.slice(0, 8).map((event) => {
            const status = statusConfig[event.status] || statusConfig.received;
            const connection = event.connection as IntegrationEvent['connection'];

            return (
              <div
                key={event.id}
                className={cn(
                  'flex items-center gap-3 py-2 px-2 -mx-2 rounded-md transition-colors',
                  'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                )}
              >
                <div className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full shrink-0',
                  event.direction === 'inbound'
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-purple-100 dark:bg-purple-900/30'
                )}>
                  {event.direction === 'inbound' ? (
                    <ArrowDownLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {event.event_type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {connection?.name || 'Conexión'} • {event.source}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn('text-xs', status.color)}>
                    {status.icon}
                  </Badge>
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-14 text-right">
                    {formatTimeAgo(event.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default RecentEvents;
