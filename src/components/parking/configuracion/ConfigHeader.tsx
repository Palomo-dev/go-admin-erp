'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Settings, RefreshCw, RotateCcw, Save } from 'lucide-react';

interface ConfigHeaderProps {
  onSave: () => void;
  onReset: () => void;
  onRefresh: () => void;
  isSaving?: boolean;
  isLoading?: boolean;
  hasChanges?: boolean;
}

export function ConfigHeader({
  onSave,
  onReset,
  onRefresh,
  isSaving,
  isLoading,
  hasChanges,
}: ConfigHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Settings className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Configuración del Parqueadero
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Personaliza horarios, políticas y parámetros operativos
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="dark:border-gray-600"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Recargar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={isLoading || isSaving}
          className="dark:border-gray-600 text-amber-600 hover:text-amber-700"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Restablecer
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={isLoading || isSaving || !hasChanges}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSaving ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Guardar Cambios
        </Button>
      </div>
    </div>
  );
}

export default ConfigHeader;
