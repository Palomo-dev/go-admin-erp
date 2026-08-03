'use client';

import React from 'react';
import { GitMerge, RefreshCw, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface MapeosHeaderProps {
  totalMappings: number;
  deletedCount: number;
  showDeleted: boolean;
  onShowDeletedChange: (show: boolean) => void;
  onRefresh: () => void;
  onNewMapping: () => void;
  onImport: () => void;
  refreshing?: boolean;
}

export function MapeosHeader({
  totalMappings,
  deletedCount,
  showDeleted,
  onShowDeletedChange,
  onRefresh,
  onNewMapping,
  onImport,
  refreshing = false,
}: MapeosHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-4 sm:px-6 py-4">
        {/* Header principal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
              <GitMerge className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Mapeos de Objetos
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Relaciones entre IDs externos e internos
              </p>
            </div>
          </div>

          {/* Badges de estadísticas */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {totalMappings} activos
            </Badge>
            {deletedCount > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {deletedCount} eliminados
              </Badge>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-4 mt-4">
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
              onClick={onImport}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>
            <Button
              size="sm"
              onClick={onNewMapping}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Mapeo
            </Button>
          </div>

          {/* Toggle mostrar eliminados */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-deleted"
              checked={showDeleted}
              onCheckedChange={onShowDeletedChange}
            />
            <Label
              htmlFor="show-deleted"
              className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
            >
              Mostrar eliminados
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapeosHeader;
