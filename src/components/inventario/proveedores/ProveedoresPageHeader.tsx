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
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
          Catálogo de Proveedores
        </h1>
        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Gestione sus proveedores, condiciones de pago e historial de compras
        </p>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <Button 
          onClick={onNuevoProveedor}
          className={`${theme === 'dark' 
            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
            : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Nuevo Proveedor
        </Button>
        
        <Button 
          variant="outline" 
          className={`${theme === 'dark' 
            ? 'border-gray-700 text-gray-300 hover:bg-gray-800' 
            : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
        
        <Button 
          variant="outline" 
          className={`${theme === 'dark' 
            ? 'border-gray-700 text-gray-300 hover:bg-gray-800' 
            : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
        >
          <Upload className="mr-2 h-4 w-4" />
          Importar
        </Button>
        
        <Button 
          variant="outline" 
          className={`${theme === 'dark' 
            ? 'border-gray-700 text-gray-300 hover:bg-gray-800' 
            : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
        >
          <FileBox className="mr-2 h-4 w-4" />
          Generar Reporte
        </Button>
      </div>
    </div>
  );
};

export default ProveedoresPageHeader;
