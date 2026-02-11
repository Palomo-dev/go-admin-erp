'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Activity, FileText, ShoppingCart, CreditCard, User, Settings, Box } from 'lucide-react';
import { formatDate } from '@/utils/Utils';
import type { ActividadReciente } from './reportesService';

interface ReportesActividadProps {
  data: ActividadReciente[];
  isLoading: boolean;
}

const entityIcons: Record<string, typeof Activity> = {
  sale: ShoppingCart,
  invoice: FileText,
  payment: CreditCard,
  product: Box,
  user: User,
  config: Settings,
};

const actionLabels: Record<string, string> = {
  create: 'Creó',
  update: 'Actualizó',
  delete: 'Eliminó',
  cancel: 'Canceló',
  approve: 'Aprobó',
  checkin: 'Check-in',
  checkout: 'Check-out',
};

export function ReportesActividad({ data, isLoading }: ReportesActividadProps) {
  if (isLoading) {
    return <Skeleton className="h-80 rounded-xl" />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
          <Activity className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Actividad Reciente
        </h3>
      </div>

      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No hay actividad reciente registrada
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {data.map((item) => {
            const Icon = entityIcons[item.entity_type] || Activity;
            const actionLabel = actionLabels[item.action] || item.action;
            const timeAgo = getTimeAgo(item.created_at);

            return (
              <div
                key={item.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    <span className="font-medium">{actionLabel}</span>{' '}
                    <span className="text-gray-500 dark:text-gray-400">
                      {item.entity_type}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {timeAgo}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return formatDate(date);
}
