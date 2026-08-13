"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Download, Upload, Truck, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import Link from 'next/link';

interface ProveedoresPageHeaderProps {
  onNuevoProveedor: () => void;
  onExportCSV?: () => void;
  onExportXLSX?: () => void;
  onExportPDF?: () => void;
}

/**
 * Encabezado de la página de proveedores con acciones principales
 */
const ProveedoresPageHeader: React.FC<ProveedoresPageHeaderProps> = ({ 
  onNuevoProveedor,
  onExportCSV,
  onExportXLSX,
  onExportPDF
}) => {

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
        
        {(onExportCSV || onExportXLSX || onExportPDF) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full sm:w-auto text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onExportCSV && (
                <DropdownMenuItem onClick={onExportCSV}>CSV (.csv)</DropdownMenuItem>
              )}
              {onExportXLSX && (
                <DropdownMenuItem onClick={onExportXLSX}>Excel (.xlsx)</DropdownMenuItem>
              )}
              {onExportPDF && (
                <DropdownMenuItem onClick={onExportPDF}>PDF (.pdf)</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
