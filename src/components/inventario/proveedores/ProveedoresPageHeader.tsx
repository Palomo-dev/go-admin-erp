"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileBox, Download, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';

interface ProveedoresPageHeaderProps {
  onNuevoProveedor: () => void;
}

/**
 * Encabezado de la página de proveedores con acciones principales
 */
const ProveedoresPageHeader: React.FC<ProveedoresPageHeaderProps> = ({ 
  onNuevoProveedor 
}) => {
  const { theme } = useTheme();
  
  return (
    <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 dark:text-blue-400">
          Catálogo de Proveedores
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
          Gestione sus proveedores, condiciones de pago e historial de compras
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Button 
          onClick={onNuevoProveedor}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm"
        >
          <PlusCircle className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Nuevo Proveedor</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Download className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden md:inline">Exportar</span>
          <span className="md:hidden">Exp</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Upload className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden md:inline">Importar</span>
          <span className="md:hidden">Imp</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <FileBox className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden lg:inline">Generar Reporte</span>
          <span className="lg:hidden">Reporte</span>
        </Button>
      </div>
    </div>
  );
};

export default ProveedoresPageHeader;
