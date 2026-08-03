'use client';

import React from 'react';
import { Activity, RefreshCw, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EventsHeaderProps {
  totalEvents: number;
  processedCount: number;
  errorCount: number;
  onRefresh: () => void;
  onExport: (format: 'json' | 'csv') => void;
  refreshing?: boolean;
}

export function EventsHeader({
  totalEvents,
  processedCount,
  errorCount,
  onRefresh,
  onExport,
  refreshing = false,
}: EventsHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-4 sm:px-6 py-4">
        {/* Header principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-green-100 dark:bg-green-900/30">
              <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Eventos de Integración
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Bandeja unificada de eventos inbound y logs de sincronización
              </p>
            </div>
          </div>

          {/* Badges de estadísticas */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {totalEvents} total
            </Badge>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {processedCount} procesados
            </Badge>
            {errorCount > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {errorCount} errores
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="dark:border-gray-700 dark:text-gray-300"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('json')}>
                <FileJson className="h-4 w-4 mr-2" />
                Exportar JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default EventsHeader;
