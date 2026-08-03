'use client';

import React from 'react';
import { Settings, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfigHeaderProps {
  onRefresh: () => void;
  onReset: () => void;
  refreshing?: boolean;
}

export function ConfigHeader({
  onRefresh,
  onReset,
  refreshing = false,
}: ConfigHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-4 sm:px-6 py-4">
        {/* Header principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Settings className="h-6 w-6 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Configuración de Integraciones
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Parámetros del módulo, límites y preferencias
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
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
              variant="outline"
              size="sm"
              onClick={onReset}
              className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-900/20"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar Defaults
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfigHeader;
