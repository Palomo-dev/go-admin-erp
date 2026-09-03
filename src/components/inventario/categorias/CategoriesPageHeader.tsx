'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/Utils';
import { Plus, RefreshCw, FolderTree, ArrowLeft, Download, Upload, ChevronDown } from 'lucide-react';

interface CategoriesPageHeaderProps {
  isRefreshing: boolean;
  onRefresh: () => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
  onExportPDF: () => void;
  onImport: () => void;
}

export function CategoriesPageHeader({
  isRefreshing,
  onRefresh,
  onExportCSV,
  onExportXLSX,
  onExportPDF,
  onImport,
}: CategoriesPageHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
      <div className="px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {/* Título */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/app/inventario"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
              aria-label="Volver a inventario"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex-shrink-0">
              <FolderTree className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">Categorías</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                Organiza tus productos en categorías jerárquicas
              </p>
            </div>
          </div>

          {/* Acciones: en móvil grid 2 columnas con texto completo, en sm+ fila */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-300 dark:border-gray-700 w-full sm:w-auto justify-center"
                >
                  <Download className="h-4 w-4 mr-1.5 flex-shrink-0" />
                  Exportar
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportXLSX}>
                  <Download className="h-4 w-4 mr-2" />
                  Excel (XLSX)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={onImport}
              className="border-gray-300 dark:border-gray-700 w-full sm:w-auto justify-center"
            >
              <Upload className="h-4 w-4 mr-1.5 flex-shrink-0" />
              Importar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="border-gray-300 dark:border-gray-700 w-full sm:w-auto justify-center"
            >
              <RefreshCw className={cn('h-4 w-4 mr-1.5 flex-shrink-0', isRefreshing && 'animate-spin')} />
              Actualizar
            </Button>

            <Button
              size="sm"
              onClick={() => router.push('/app/inventario/categorias/nuevo')}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto justify-center col-span-2 sm:col-span-1"
            >
              <Plus className="h-4 w-4 mr-1.5 flex-shrink-0" />
              Nueva Categoría
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
