'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Plus,
  Download,
  Upload,
  DollarSign,
} from 'lucide-react';

interface TarifasHeaderProps {
  onRefresh: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
  isLoading: boolean;
}

export function TarifasHeader({
  onRefresh,
  onAdd,
  onImport,
  onExport,
  isLoading,
}: TarifasHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Tarifas de Parqueo
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configuración de precios por tipo de vehículo y unidad de tiempo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
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
            Nueva Tarifa
          </Button>
        </div>
      </div>
    </div>
  );
}
