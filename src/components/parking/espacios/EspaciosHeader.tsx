'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Plus,
  Download,
  Upload,
  LayoutGrid,
  List,
  ParkingSquare,
} from 'lucide-react';

interface EspaciosHeaderProps {
  onRefresh: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  isLoading: boolean;
}

export function EspaciosHeader({
  onRefresh,
  onAdd,
  onImport,
  onExport,
  viewMode,
  onViewModeChange,
  isLoading,
}: EspaciosHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <ParkingSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Espacios de Parqueo
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Administración de espacios físicos del parqueadero
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewModeChange('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewModeChange('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          <Button variant="outline" onClick={onImport}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>

          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>

          <Button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Espacio
          </Button>
        </div>
      </div>
    </div>
  );
}
