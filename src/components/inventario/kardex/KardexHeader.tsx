'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollText, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface KardexHeaderProps {
  productName: string;
  productSku: string;
  productUuid?: string;
  onRefresh: () => void;
  onExport: () => void;
  isLoading?: boolean;
}

export function KardexHeader({
  productName,
  productSku,
  productUuid,
  onRefresh,
  onExport,
  isLoading
}: KardexHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <ScrollText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kardex de Producto
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {productName} · SKU: {productSku}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {productUuid && (
          <Link href={`/app/inventario/productos/${productUuid}`}>
            <Button
              variant="outline"
              size="sm"
              className="dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Producto
            </Button>
          </Link>
        )}

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
      </div>
    </div>
  );
}

export default KardexHeader;
