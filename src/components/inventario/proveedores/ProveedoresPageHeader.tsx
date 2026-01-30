"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Download, Upload, Truck } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

interface ProveedoresPageHeaderProps {
  onNuevoProveedor: () => void;
  onExport?: () => void;
}

/**
 * Encabezado de la página de proveedores con acciones principales
 */
const ProveedoresPageHeader: React.FC<ProveedoresPageHeaderProps> = ({ 
  onNuevoProveedor,
  onExport
}) => {
  const { theme } = useTheme();
  
  return (
    <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Truck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Catálogo de Proveedores
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Gestiona proveedores, condiciones de pago e historial de compras
          </p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Button 
          onClick={onNuevoProveedor}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-sm"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Nuevo Proveedor
        </Button>
        
        {onExport && (
          <Button 
            variant="outline" 
            onClick={onExport}
            className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        )}
        
        <Link href="/app/inventario/proveedores/importar">
          <Button 
            variant="outline" 
            className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default ProveedoresPageHeader;
