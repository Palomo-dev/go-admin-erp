'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, RefreshCw, Download, Save } from 'lucide-react';

interface ReportesHeaderProps {
  onRefresh: () => void;
  onExport: () => void;
  onSaveFilters: () => void;
  isLoading?: boolean;
}

export function ReportesHeader({
  onRefresh,
  onExport,
  onSaveFilters,
  isLoading,
}: ReportesHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <BarChart3 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Reportes de Parking
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Análisis de ocupación, ingresos y métricas del negocio
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
          Actualizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveFilters}
          className="dark:border-gray-600"
        >
          <Save className="h-4 w-4 mr-2" />
          Guardar Filtros
        </Button>
        <Button
          onClick={onExport}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>
    </div>
  );
}

export default ReportesHeader;
