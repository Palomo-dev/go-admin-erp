'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';
import { formatDate } from '@/utils/Utils';
import type { SystemAlert } from '@/lib/services/notificacionesDashboardService';

interface AlertasCriticasProps {
  alerts: SystemAlert[];
  isLoading: boolean;
  onAcknowledge: (alertId: string) => void;
}

const severityConfig: Record<string, { label: string; badge: string; icon: typeof AlertTriangle }> = {
  critical: { label: 'Crítica', badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: ShieldAlert },
  error: { label: 'Error', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', icon: AlertTriangle },
  warning: { label: 'Advertencia', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', icon: AlertTriangle },
  info: { label: 'Info', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', icon: AlertTriangle },
};

const statusConfig: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Pendiente', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  acknowledged: { label: 'Reconocida', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  resolved: { label: 'Resuelta', badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
};

export function AlertasCriticas({ alerts, isLoading, onAcknowledge }: AlertasCriticasProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Alertas Críticas</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="h-5 w-5 text-red-500" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alertas Críticas</h2>
        {alerts.length > 0 && (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 ml-auto">
            {alerts.length}
          </Badge>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
          <CheckCircle2 className="h-10 w-10 mb-2" />
          <p className="text-sm">Sin alertas críticas recientes</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {alerts.map(alert => {
            const sev = severityConfig[alert.severity] || severityConfig.info;
            const stat = statusConfig[alert.status] || statusConfig.pending;
            const SevIcon = sev.icon;

            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <SevIcon className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {alert.title}
                    </p>
                    <Badge className={sev.badge}>{sev.label}</Badge>
                    <Badge className={stat.badge}>{stat.label}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-400">{formatDate(alert.created_at)}</span>
                    <Badge variant="outline" className="text-xs py-0 h-5">
                      {alert.source_module}
                    </Badge>
                  </div>
                </div>
                {alert.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAcknowledge(alert.id)}
                    className="flex-shrink-0 text-xs"
                  >
                    Reconocer
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
