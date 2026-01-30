'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ClipboardEdit, 
  Plus,
  Package,
  ArrowRightLeft,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface AjustesHeaderProps {
  onRefresh: () => void;
  isLoading?: boolean;
}

export function AjustesHeader({ onRefresh, isLoading }: AjustesHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <ClipboardEdit className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Ajustes de Inventario
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestión de conteos, mermas y correcciones de stock
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

        <Link href="/app/inventario/movimientos">
          <Button
            variant="outline"
            size="sm"
            className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Movimientos
          </Button>
        </Link>

        <Link href="/app/inventario/ajustes/nuevo">
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Ajuste
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default AjustesHeader;
