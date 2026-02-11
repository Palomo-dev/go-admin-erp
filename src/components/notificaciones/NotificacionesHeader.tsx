'use client';

import { Button } from '@/components/ui/button';
import { Bell, RefreshCw, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface NotificacionesHeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function NotificacionesHeader({ onRefresh, isRefreshing }: NotificacionesHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Notificaciones
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Dashboard de alertas, envíos y canales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
