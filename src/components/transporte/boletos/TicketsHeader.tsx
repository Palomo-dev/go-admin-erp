'use client';

import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Download } from 'lucide-react';

interface TicketsHeaderProps {
  onNew: () => void;
  onRefresh: () => void;
  onExport?: () => void;
  isLoading?: boolean;
}

export function TicketsHeader({ onNew, onRefresh, onExport, isLoading }: TicketsHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Boletos</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestión de venta y reserva de boletos de pasajeros
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
        <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Boleto
        </Button>
      </div>
    </div>
  );
}
