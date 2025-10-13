'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Plus, Download, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function PageHeader() {
  const router = useRouter();

  const handleNuevaFactura = () => {
    router.push('/app/finanzas/facturas-compra/nuevo');
  };

  const handleImportarOFX = () => {
    // TODO: Implementar importación OFX para conciliación bancaria
    console.log('Importar OFX para conciliación bancaria');
  };

  const handleExportarPDF = () => {
    // TODO: Implementar exportación de reporte
    console.log('Exportar reporte PDF');
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
      <div className="flex items-center space-x-2 sm:space-x-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Facturas de Compra
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
            Gestión de facturas de proveedores, cuentas por pagar y conciliación bancaria
          </p>
        </div>
      </div>
      
      <div className="flex gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={handleImportarOFX}
          className="flex-1 sm:flex-none h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
          <span className="hidden sm:inline">Importar OFX</span>
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportarPDF}
          className="flex-1 sm:flex-none h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </Button>
        
        <Button
          onClick={handleNuevaFactura}
          size="sm"
          className="flex-1 sm:flex-none h-8 sm:h-9 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
          <span className="hidden xs:inline">Nueva Factura</span>
          <span className="xs:hidden">Nueva</span>
        </Button>
      </div>
    </div>
  );
}
