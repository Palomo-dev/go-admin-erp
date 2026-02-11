'use client';

import { Button } from '@/components/ui/button';
import { FileText, RefreshCw, ArrowLeft, Plus, Download, Upload } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';

interface PlantillasHeaderProps {
  totalTemplates: number;
  channelCounts: Record<string, number>;
  isLoading: boolean;
  isRefreshing: boolean;
  isAdmin: boolean;
  onRefresh: () => void;
  onCreateNew: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function PlantillasHeader({
  totalTemplates,
  channelCounts,
  isLoading,
  isRefreshing,
  isAdmin,
  onRefresh,
  onCreateNew,
  onExport,
  onImport,
}: PlantillasHeaderProps) {
  const summary = Object.entries(channelCounts)
    .map(([ch, c]) => `${c} ${ch}`)
    .join(' · ');

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
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Plantillas de Notificación
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {totalTemplates} plantillas{summary ? ` · ${summary}` : ''}
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
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExport}
                  className="border-gray-300 dark:border-gray-700"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onImport}
                  className="border-gray-300 dark:border-gray-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                </Button>
                <Button
                  size="sm"
                  onClick={onCreateNew}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Plantilla
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
