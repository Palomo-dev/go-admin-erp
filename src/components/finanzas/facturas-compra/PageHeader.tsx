'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileText, Plus, Download, Upload, ArrowLeft, RefreshCw } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

interface PageHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function PageHeader({ onRefresh, isRefreshing }: PageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Detectar si estamos en inventario o finanzas
  const isInventario = pathname.includes('/inventario/');
  const basePath = isInventario 
    ? '/app/inventario/facturas-compra' 
    : '/app/finanzas/facturas-compra';
  const backPath = isInventario ? '/app/inventario' : '/app/finanzas';
  const breadcrumb = isInventario ? 'Inventario / Facturas de Compra' : 'Finanzas / Facturas de Compra';

  const handleNuevaFactura = () => {
    router.push(`${basePath}/nuevo`);
  };

  const handleImportarOFX = () => {
    console.log('Importar OFX para conciliación bancaria');
  };

  const handleExportarPDF = () => {
    console.log('Exportar reporte PDF');
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
      {/* Título con icono */}
      <div className="flex items-center gap-3">
        <Link href={backPath}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <FileText className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Facturas de Compra
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {breadcrumb}
          </p>
        </div>
      </div>
      
      {/* Botones de acción */}
      <div className="flex flex-row gap-2 w-full sm:w-auto">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 flex-1 sm:flex-initial bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 flex-shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleImportarOFX}
          className="flex items-center justify-center gap-2 flex-1 sm:flex-initial bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
        >
          <Upload className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium hidden sm:inline">Importar</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportarPDF}
          className="flex items-center justify-center gap-2 flex-1 sm:flex-initial bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
        >
          <Download className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium hidden sm:inline">Exportar</span>
        </Button>
        <Button
          size="sm"
          onClick={handleNuevaFactura}
          className="flex items-center justify-center gap-2 flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white shadow-sm hover:shadow-md transition-all"
        >
          <Plus className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">Nueva Factura</span>
        </Button>
      </div>
    </div>
  );
}
