'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ArrowRightLeft, 
  Download, 
  Package,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface MovimientosHeaderProps {
  onExport: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function MovimientosHeader({ onExport, onRefresh, isLoading }: MovimientosHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <ArrowRightLeft className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Movimientos de Inventario
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Kardex y trazabilidad de entradas y salidas
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>

        <Link href="/app/inventario/stock">
          <Button
            variant="outline"
            size="sm"
            className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Package className="h-4 w-4 mr-2" />
            Ver Stock
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default MovimientosHeader;
