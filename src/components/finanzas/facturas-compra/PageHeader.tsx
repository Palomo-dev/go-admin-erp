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
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href={backPath}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            Facturas de Compra
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {breadcrumb}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
        <Button variant="outline" onClick={handleImportarOFX}>
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>
        <Button variant="outline" onClick={handleExportarPDF}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
        <Button onClick={handleNuevaFactura} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Factura
        </Button>
      </div>
    </div>
  );
}
