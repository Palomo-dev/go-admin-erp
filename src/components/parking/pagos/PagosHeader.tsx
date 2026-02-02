'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, Plus, RefreshCw, Download } from 'lucide-react';

interface PagosHeaderProps {
  onNewPayment: () => void;
  onRefresh: () => void;
  onExport: () => void;
  isLoading?: boolean;
}

export function PagosHeader({ onNewPayment, onRefresh, onExport, isLoading }: PagosHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Wallet className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pagos de Parking
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Registro y consulta de pagos por sesiones y abonados
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
          onClick={onExport}
          className="dark:border-gray-600"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
        <Button
          onClick={onNewPayment}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Registrar Pago
        </Button>
      </div>
    </div>
  );
}

export default PagosHeader;
