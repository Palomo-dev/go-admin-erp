'use client';

import { Monitor, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionStats } from '@/lib/services/widgetSessionsService';

interface SessionsHeaderProps {
  stats: SessionStats;
  loading: boolean;
  onRefresh: () => void;
}

export default function SessionsHeader({
  stats,
  loading,
  onRefresh
}: SessionsHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Monitor className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                Sesiones del Widget
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Monitorea la actividad del widget web en tiempo real
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="border-gray-300 dark:border-gray-700 gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">En línea</p>
          </div>
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.expired}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Expiradas</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.withCustomer}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Con cliente</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.anonymous}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Anónimas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
