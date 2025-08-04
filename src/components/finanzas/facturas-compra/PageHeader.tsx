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
    <div className="flex justify-between items-center">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Facturas de Compra
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestión de facturas de proveedores, cuentas por pagar y conciliación bancaria
          </p>
        </div>
      </div>
      
      <div className="flex space-x-2">
        <Button
          variant="outline"
          onClick={handleImportarOFX}
          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Upload className="w-4 h-4 mr-2" />
          Importar OFX
        </Button>
        
        <Button
          variant="outline"
          onClick={handleExportarPDF}
          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
        
        <Button
          onClick={handleNuevaFactura}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nueva Factura
        </Button>
      </div>
    </div>
  );
}
