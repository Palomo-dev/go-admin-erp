'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { SystemAlert } from '@/lib/services/notificacionesDashboardService';

interface AlertasRecientesProps {
  alerts: SystemAlert[];
  isLoading?: boolean;
  maxItems?: number;
}

const severityConfig: Record<string, { label: string; badge: string; icon: typeof AlertTriangle }> = {
  critical: {
    label: 'Crítica',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: ShieldAlert,
  },
  error: {
    label: 'Error',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: AlertTriangle,
  },
  warning: {
    label: 'Advertencia',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: AlertTriangle,
  },
  info: {
    label: 'Info',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: AlertTriangle,
  },
};

const statusConfig: Record<string, { label: string; badge: string }> = {
  pending: {
    label: 'Pendiente',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  acknowledged: {
    label: 'Reconocida',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  resolved: {
    label: 'Resuelta',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
};

export function AlertasRecientes({ alerts, isLoading, maxItems = 10 }: AlertasRecientesProps) {
  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Alertas Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const alertasMostradas = alerts.slice(0, maxItems);

  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Alertas Recientes
          </CardTitle>
          {alerts.length > 0 && (
            <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
              {alerts.length} {alerts.length === 1 ? 'alerta' : 'alertas'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Sin alertas críticas recientes</p>
            <p className="text-sm">¡Todo está en orden!</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {alertasMostradas.map((alert) => {
              const sev = severityConfig[alert.severity] || severityConfig.info;
              const stat = statusConfig[alert.status] || statusConfig.pending;
              const SevIcon = sev.icon;

              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 flex-shrink-0">
                    <SevIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-sm text-gray-900 dark:text-white break-words whitespace-normal">
                        {alert.title}
                      </span>
                      <Badge className={cn('text-xs', sev.badge)}>{sev.label}</Badge>
                      <Badge className={cn('text-xs', stat.badge)}>{stat.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 break-words whitespace-normal line-clamp-2">
                      {alert.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatDate(alert.created_at)}
                      </span>
                      <Badge variant="outline" className="text-xs py-0 h-5">
                        {alert.source_module}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AlertasRecientes;
