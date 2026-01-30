'use client';

import { FlaskConical, RefreshCw, Settings, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LabHeaderProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    withEmbeddings: number;
    avgPriority: number;
  };
  loading: boolean;
  onRefresh: () => void;
  onSettings: () => void;
}

export default function LabHeader({
  stats,
  loading,
  onRefresh,
  onSettings
}: LabHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <FlaskConical className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                  Laboratorio de IA
                </h1>
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  Beta
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Prueba la IA con fragmentos de conocimiento sin afectar conversaciones reales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={onSettings}
              className="border-gray-300 dark:border-gray-700 gap-2"
            >
              <Settings className="h-4 w-4" />
              Configuración
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
              <Database className="h-3 w-3" />
              Total
            </div>
            <p className="text-xl font-semibold text-gray-900 dark:text-white">
              {stats.total}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Activos</div>
            <p className="text-xl font-semibold text-green-600 dark:text-green-400">
              {stats.active}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Inactivos</div>
            <p className="text-xl font-semibold text-gray-600 dark:text-gray-400">
              {stats.inactive}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Con Embeddings</div>
            <p className="text-xl font-semibold text-blue-600 dark:text-blue-400">
              {stats.withEmbeddings}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Prioridad Prom.</div>
            <p className="text-xl font-semibold text-purple-600 dark:text-purple-400">
              {stats.avgPriority}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
