'use client';

import { Button } from '@/components/ui/button';
import { Settings2, RefreshCw, ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';

interface PreferenciasHeaderProps {
  isLoading: boolean;
  isRefreshing: boolean;
  isMutedAll: boolean;
  onRefresh: () => void;
  onReset: () => void;
}

export function PreferenciasHeader({
  isLoading,
  isRefreshing,
  isMutedAll,
  onRefresh,
  onReset,
}: PreferenciasHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/notificaciones"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Settings2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Preferencias de Notificación
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configura cómo y cuándo recibir notificaciones
                {isMutedAll && (
                  <span className="ml-2 text-red-500 font-medium">· Todas silenciadas</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing || isLoading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Actualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="border-gray-300 dark:border-gray-700 text-amber-600 hover:text-amber-700 dark:text-amber-400"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restablecer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
