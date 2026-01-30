'use client';

import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Download, Upload } from 'lucide-react';

interface TripsHeaderProps {
  onNew: () => void;
  onRefresh: () => void;
  onExport?: () => void;
  onImport?: () => void;
  isLoading?: boolean;
}

export function TripsHeader({
  onNew,
  onRefresh,
  onExport,
  onImport,
  isLoading,
}: TripsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Viajes
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestión operativa de viajes programados
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onImport && (
          <Button variant="outline" size="sm" onClick={onImport}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
        )}
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Viaje
        </Button>
      </div>
    </div>
  );
}
