"use client";

import React from 'react';
import { useTheme } from 'next-themes';
import { PlusCircle, FileSpreadsheet, Download } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProductosPageHeaderProps {
  onCrearClick: () => void;
  onImportarClick?: () => void; 
  onExportarClick?: () => void;
}

/**
 * Encabezado de la página de productos con título y acciones
 */
const ProductosPageHeader: React.FC<ProductosPageHeaderProps> = ({
  onCrearClick,
  onImportarClick = () => {},
  onExportarClick = () => {}
}) => {
  const { theme } = useTheme();
  
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
        Catálogo de Productos
      </h1>
      
      <div className="flex flex-col sm:flex-row gap-2">
        <Button 
          onClick={onCrearClick}
          className={`${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Nuevo Producto
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className={theme === 'dark' ? 'dark:border-gray-700 dark:text-gray-200' : ''}
            >
              Más opciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className={`w-56 ${theme === 'dark' ? 'dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800' : ''}`}
            align="end"
          >
            <DropdownMenuItem 
              onClick={onImportarClick}
              className={theme === 'dark' ? 'dark:hover:bg-gray-800' : ''}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              <span>Importar CSV</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onExportarClick}
              className={theme === 'dark' ? 'dark:hover:bg-gray-800' : ''}
            >
              <Download className="mr-2 h-4 w-4" />
              <span>Exportar</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ProductosPageHeader;
