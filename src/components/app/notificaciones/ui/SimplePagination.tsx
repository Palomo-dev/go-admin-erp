/**
 * Componente de paginación simple con selector de páginas
 * Permite navegar directamente a cualquier página
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Props del componente
 */
interface SimplePaginationProps {
  /** Página actual */
  currentPage: number;
  /** Total de páginas */
  totalPages: number;
  /** Total de elementos */
  total: number;
  /** Elementos por página */
  limit: number;
  /** Función para cambiar de página */
  onPageChange: (page: number) => void;
  /** Estado de carga */
  loading?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Componente de paginación simple
 */
export function SimplePagination({
  currentPage,
  totalPages,
  total,
  limit,
  onPageChange,
  loading = false,
  className,
}: SimplePaginationProps) {
  // Si no hay páginas, no mostrar paginación
  if (totalPages <= 1) return null;

  // Calcular rango de elementos
  const startItem = (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, total);

  /**
   * Generar opciones de páginas para el selector
   */
  const pageOptions = Array.from({ length: totalPages }, (_, i) => i + 1);

  /**
   * Navegar a página específica
   */
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !loading) {
      onPageChange(page);
    }
  };

  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-3 bg-background border-t",
      className
    )}>
      {/* Información de elementos */}
      <div className="flex items-center text-sm text-muted-foreground">
        <span>
          Mostrando {startItem.toLocaleString()} - {endItem.toLocaleString()} de {total.toLocaleString()} elementos
        </span>
      </div>

      {/* Controles de paginación */}
      <div className="flex items-center space-x-2">
        {/* Primera página */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(1)}
          disabled={currentPage === 1 || loading}
          className="hidden sm:flex"
        >
          <ChevronsLeft className="w-4 h-4" />
        </Button>

        {/* Página anterior */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1 || loading}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        {/* Selector de página */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Página</span>
          <Select 
            value={currentPage.toString()} 
            onValueChange={(value) => goToPage(parseInt(value))}
            disabled={loading}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageOptions.map((page) => (
                <SelectItem key={page} value={page.toString()}>
                  {page}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            de {totalPages}
          </span>
        </div>

        {/* Página siguiente */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Última página */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages || loading}
          className="hidden sm:flex"
        >
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default SimplePagination;
