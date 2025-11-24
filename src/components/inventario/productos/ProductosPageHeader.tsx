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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-600 dark:text-blue-400">
        Catálogo de Productos
      </h1>
      
      <div className="flex flex-col sm:flex-row gap-2">
        <Button 
          onClick={onCrearClick}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm"
        >
          <PlusCircle className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Nuevo Producto</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 text-sm"
            >
              <span className="hidden sm:inline">Más opciones</span>
              <span className="sm:hidden">Opciones</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-48 sm:w-56 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700"
            align="end"
          >
            <DropdownMenuItem 
              onClick={onImportarClick}
              className="dark:hover:bg-gray-700 dark:focus:bg-gray-700 text-sm"
            >
              <FileSpreadsheet className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span>Importar CSV</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onExportarClick}
              className="dark:hover:bg-gray-700 dark:focus:bg-gray-700 text-sm"
            >
              <Download className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              <span>Exportar</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ProductosPageHeader;
