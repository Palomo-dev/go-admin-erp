"use client";

import React from 'react';
import Link from 'next/link';
import {
  Package,
  PlusCircle,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Sparkles,
  Globe,
  Link2,
} from 'lucide-react';
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
  onExportarFacebookClick?: () => void;
  onFacebookFeedClick?: () => void;
  onRefreshClick?: () => void;
  onScrapingClick?: () => void;
  isRefreshing?: boolean;
  totalProducts?: number;
  /** Indica que la carga completa en background está en progreso */
  backgroundLoading?: boolean;
  /** Progreso de la carga por lotes: productos ya cargados de cuántos. */
  progresoCarga?: { cargados: number; total: number } | null;
}

/**
 * Encabezado de la página de productos con título y acciones
 */
const ProductosPageHeader: React.FC<ProductosPageHeaderProps> = ({
  onCrearClick,
  onImportarClick = () => {},
  onExportarClick = () => {},
  onExportarFacebookClick = () => {},
  onFacebookFeedClick = () => {},
  onRefreshClick,
  onScrapingClick,
  isRefreshing = false,
  totalProducts,
  backgroundLoading = false,
  progresoCarga = null
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
              <>
                {totalProducts.toLocaleString('es-CO')} productos en el catálogo
                {backgroundLoading && progresoCarga && progresoCarga.cargados < progresoCarga.total && (
                  <span className="ml-2 inline-flex items-center gap-1 text-brand-deep" aria-live="polite">
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Cargando {progresoCarga.cargados.toLocaleString('es-CO')} de {progresoCarga.total.toLocaleString('es-CO')}
                  </span>
                )}
              </>
            ) : (
              <>Gestiona tu inventario de productos</>
            )}
          </p>
          {/* Barra de progreso de la carga por lotes: se llena mientras llegan
              los productos y desaparece al terminar. */}
          {backgroundLoading && progresoCarga && progresoCarga.total > 0 && progresoCarga.cargados < progresoCarga.total && (
            <div
              className="mt-1.5 h-1 w-48 max-w-full overflow-hidden rounded-full bg-brand-tint"
              role="progressbar"
              aria-label="Progreso de carga del catálogo"
              aria-valuemin={0}
              aria-valuemax={progresoCarga.total}
              aria-valuenow={progresoCarga.cargados}
            >
              <div
                className="h-full rounded-full bg-brand-action transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round((progresoCarga.cargados / progresoCarga.total) * 100)}%` }}
              />
            </div>
          )}
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
            <DropdownMenuItem
              onClick={onExportarFacebookClick}
              className="cursor-pointer"
            >
              <Globe className="mr-2 h-4 w-4 text-blue-600" />
              <span>Exportar a Facebook (CSV)</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onFacebookFeedClick}
              className="cursor-pointer"
            >
              <Link2 className="mr-2 h-4 w-4 text-blue-600" />
              <span>URL Feed para Facebook</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ProductosPageHeader;
