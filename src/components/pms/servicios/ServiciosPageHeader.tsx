'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, RefreshCw, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';

interface ServiciosPageHeaderProps {
  totalCount: number;
  activeCount: number;
  customCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  onNewCustom: () => void;
}

export function ServiciosPageHeader({
  totalCount, activeCount, customCount, isRefreshing, onRefresh, onNewCustom,
}: ServiciosPageHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/pms/espacios"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Settings2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Servicios
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {totalCount} servicio{totalCount !== 1 ? 's' : ''}
                {activeCount > 0 && (
                  <> · <span className="text-green-600 dark:text-green-400">{activeCount} activo{activeCount !== 1 ? 's' : ''}</span></>
                )}
                {customCount > 0 && (
                  <> · <span className="text-blue-600 dark:text-blue-400">{customCount} personalizado{customCount !== 1 ? 's' : ''}</span></>
                )}
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
            <Button
              size="sm"
              onClick={onNewCustom}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo servicio
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
