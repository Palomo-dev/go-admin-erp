'use client';

import React from 'react';
import { Cog, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface JobsHeaderProps {
  totalJobs: number;
  runningCount: number;
  failedCount: number;
  queuedCount: number;
  onRefresh: () => void;
  onNewJob: () => void;
  refreshing?: boolean;
}

export function JobsHeader({
  totalJobs,
  runningCount,
  failedCount,
  queuedCount,
  onRefresh,
  onNewJob,
  refreshing = false,
}: JobsHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-4 sm:px-6 py-4">
        {/* Header principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-900/30">
              <Cog className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Jobs de Sincronización
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monitor y gestión de tareas de integración
              </p>
            </div>
          </div>

          {/* Badges de estadísticas */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {totalJobs} total
            </Badge>
            {runningCount > 0 && (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {runningCount} ejecutando
              </Badge>
            )}
            {queuedCount > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                {queuedCount} en cola
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {failedCount} fallidos
              </Badge>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="dark:border-gray-700 dark:text-gray-300"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            size="sm"
            onClick={onNewJob}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Job
          </Button>
        </div>
      </div>
    </div>
  );
}

export default JobsHeader;
