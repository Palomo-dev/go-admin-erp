'use client';

import React from 'react';
import { Plus, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EspaciosPageHeaderProps {
  onRefresh: () => void;
  onExport: () => void;
  onNew: () => void;
  isLoading: boolean;
  canExport: boolean;
}

export function EspaciosPageHeader({
  onRefresh,
  onExport,
  onNew,
  isLoading,
  canExport,
}: EspaciosPageHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Inventario de Espacios
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona habitaciones, cabañas y otros espacios
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={!canExport}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            
            <Button size="sm" onClick={onNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Espacio
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
