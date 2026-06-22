"use client";

import React from 'react';
import Link from 'next/link';
import { Package, PlusCircle, FileSpreadsheet, Download, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ProductosPageHeaderProps {
  onCrearClick: () => void;
  onImportarClick?: () => void; 
  onExportarClick?: () => void;
  onRefreshClick?: () => void;
  onScrapingClick?: () => void;
  isRefreshing?: boolean;
  totalProducts?: number;
}

/**
 * Encabezado de la página de productos con título y acciones
 */
const ProductosPageHeader: React.FC<ProductosPageHeaderProps> = ({
  onCrearClick,
  onImportarClick = () => {},
  onExportarClick = () => {},
  onRefreshClick,
  onScrapingClick,
  isRefreshing = false,
  totalProducts
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      {/* Título y descripción */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
          <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Catálogo de Productos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {totalProducts !== undefined ? (
              <>{totalProducts} productos en el catálogo</>
            ) : (
              <>Gestiona tu inventario de productos</>
            )}
          </p>
        </div>
      </div>
      
      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
        {/* Botón Refrescar */}
        {onRefreshClick && (
          <Button 
            variant="outline" 
            size="icon"
            onClick={onRefreshClick}
            disabled={isRefreshing}
            className="h-9 w-9"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}

        {/* Botón Importar con IA */}
        {onScrapingClick && (
          <Button 
            onClick={onScrapingClick}
            className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white dark:text-white whitespace-nowrap"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Importar con IA
          </Button>
        )}

        {/* Botón Nuevo Producto */}
        <Link href="/app/inventario/productos/nuevo" prefetch={true}>
          <Button 
            onClick={onCrearClick}
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Nuevo Producto
          </Button>
        </Link>
        
        {/* Menú de opciones */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Más opciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-56 dark:bg-gray-800 dark:border-gray-700"
            align="end"
          >
            <DropdownMenuItem 
              onClick={onImportarClick}
              className="cursor-pointer"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              <span>Importar desde CSV</span>
            </DropdownMenuItem>
            {onScrapingClick && (
              <DropdownMenuItem 
                onClick={onScrapingClick}
                className="cursor-pointer"
              >
                <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                <span>Importar desde web (IA)</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onExportarClick}
              className="cursor-pointer"
            >
              <Download className="mr-2 h-4 w-4" />
              <span>Exportar a CSV</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ProductosPageHeader;
