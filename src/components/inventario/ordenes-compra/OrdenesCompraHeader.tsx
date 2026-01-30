'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, FileDown, FileUp } from 'lucide-react';

interface OrdenesCompraHeaderProps {
  onExport?: () => void;
}

export function OrdenesCompraHeader({ onExport }: OrdenesCompraHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Órdenes de Compra
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona las órdenes de compra a proveedores
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/inventario/ordenes-compra/importar">
          <Button variant="outline" size="sm" className="dark:border-gray-700">
            <FileUp className="h-4 w-4 mr-2" />
            Importar
          </Button>
        </Link>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} className="dark:border-gray-700">
            <FileDown className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        )}
        <Link href="/app/inventario/ordenes-compra/nuevo">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Orden
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default OrdenesCompraHeader;
